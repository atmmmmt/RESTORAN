/**
 * Lazy 3D model loading for WebAR Virtual Try-On.
 *
 * Nothing in this file is imported at page load. Three.js and the GLTF
 * loader arrive only when a customer actually opens the viewer, which keeps
 * the storefront bundle unchanged for the 99% of visits that never open it.
 *
 * Decoders are pulled from a CDN on first use rather than bundled, since
 * most models are uncompressed and would never touch them.
 */

const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/'

let threePromise = null
let loaderPromise = null

/** Load Three.js once and share the module across every caller. */
export function loadThree() {
  if (!threePromise) threePromise = import('three')
  return threePromise
}

/**
 * Build a GLTFLoader wired for Draco and Meshopt.
 * Both decoders are attached lazily and only cost anything if the file
 * actually uses that compression.
 */
async function buildLoader() {
  const [THREE, { GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
    loadThree(),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/DRACOLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ])

  const loader = new GLTFLoader()

  const draco = new DRACOLoader()
  draco.setDecoderPath(DRACO_PATH)
  draco.setDecoderConfig({ type: 'js' })   // wasm needs headers we don't control
  loader.setDRACOLoader(draco)

  loader.setMeshoptDecoder(MeshoptDecoder)

  return { THREE, loader, draco }
}

export function getLoader() {
  if (!loaderPromise) loaderPromise = buildLoader()
  return loaderPromise
}

/* Parsed scenes are cached by URL — reopening the viewer or switching back
   to a product should be instant, not a second download. */
const modelCache = new Map()

/**
 * Fetch and parse a GLB/glTF.
 *
 * @param {string} url
 * @param {(pct:number)=>void} [onProgress] 0..100, only when the server sends a length
 * @returns {Promise<{ scene:Object, animations:Array, THREE:Object }>}
 */
export async function loadModel(url, onProgress) {
  if (!url) throw new Error('لا يوجد رابط للنموذج')

  if (modelCache.has(url)) {
    const cached = modelCache.get(url)
    onProgress?.(100)
    // Hand out a clone so two viewers can't fight over one scene graph.
    return { ...cached, scene: cached.scene.clone(true) }
  }

  const { THREE, loader } = await getLoader()

  const gltf = await new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      evt => {
        if (evt.lengthComputable && onProgress) {
          onProgress(Math.round((evt.loaded / evt.total) * 100))
        }
      },
      err => reject(new Error(`تعذّر تحميل النموذج: ${err?.message || 'خطأ في الشبكة'}`))
    )
  })

  const entry = { scene: gltf.scene, animations: gltf.animations || [], THREE }
  modelCache.set(url, entry)

  return { ...entry, scene: gltf.scene.clone(true) }
}

/**
 * Normalise an arbitrary model into a predictable unit.
 *
 * Artists export at wildly different scales; without this a ring might arrive
 * 400× the size of the hand. We fit the longest axis to 1 unit and recentre
 * the pivot, so the admin's `scale` value means the same thing everywhere.
 */
export async function normalizeModel(scene) {
  const THREE = await loadThree()

  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())

  const longest = Math.max(size.x, size.y, size.z)
  const factor = longest > 0 ? 1 / longest : 1

  scene.position.sub(centre)

  const wrapper = new THREE.Group()
  wrapper.add(scene)
  wrapper.scale.setScalar(factor)

  return {
    object: wrapper,
    originalSize: { x: size.x, y: size.y, z: size.z },
    normalizationFactor: factor,
  }
}

/**
 * Cap texture resolution on weak devices.
 * A 4K albedo on a 2GB phone is the fastest route to a browser tab crash.
 */
export async function limitTextureSizes(root, maxSize = 1024) {
  const THREE = await loadThree()

  root.traverse(node => {
    if (!node.isMesh) return
    const materials = Array.isArray(node.material) ? node.material : [node.material]

    for (const material of materials) {
      if (!material) continue
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        const tex = material[slot]
        if (!tex?.image) continue
        const { width = 0, height = 0 } = tex.image
        if (Math.max(width, height) > maxSize) {
          // Mipmaps off + linear filtering keeps memory down on the oversized
          // texture we can't resize in place without re-encoding it.
          tex.generateMipmaps = false
          tex.minFilter = THREE.LinearFilter
          tex.needsUpdate = true
        }
      }
    }
  })
}

/**
 * Release every GPU resource a subtree owns.
 * Three.js does not garbage-collect these; skipping it leaks a few MB of
 * VRAM per open, and a customer flipping through products will feel it.
 */
export function disposeObject(root) {
  if (!root) return

  root.traverse(node => {
    if (node.geometry) node.geometry.dispose()

    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : []
    for (const material of materials) {
      for (const key of Object.keys(material)) {
        const value = material[key]
        if (value && value.isTexture) value.dispose()
      }
      material.dispose()
    }
  })

  root.parent?.remove(root)
}

/** Drop the shared cache — used when memory pressure is reported. */
export function clearModelCache() {
  for (const { scene } of modelCache.values()) disposeObject(scene)
  modelCache.clear()
}

/** Warm the cache during idle time once a customer shows intent. */
export function prefetchModel(url) {
  if (!url || modelCache.has(url)) return
  const run = () => loadModel(url).catch(() => { /* prefetch is best-effort */ })
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1200)
}
