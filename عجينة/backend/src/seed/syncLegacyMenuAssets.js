'use strict';

const fs = require('fs/promises');
const path = require('path');
const menu = require('./legacy-menu.json');

const PUBLIC_ROOT = path.join(__dirname, '../../../frontend/public/menu');
const PLACEHOLDER = '/images/product-placeholder.png';

function sourceSlug(sourceUrl) {
  try {
    return new URL(sourceUrl).searchParams.get('product') || '';
  } catch {
    return '';
  }
}

function categorySlug(categoryImage) {
  const file = new URL(categoryImage).pathname.split('/').pop() || '';
  return file.replace(/_md(?=\.)/, '').replace(/[^a-zA-Z0-9._-]/g, '-');
}

function extension(imageUrl) {
  try {
    const ext = path.extname(new URL(imageUrl).pathname).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
  } catch {
    return '.jpg';
  }
}

async function download(url, target) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Luliz menu migration/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  const productDir = path.join(PUBLIC_ROOT, 'products');
  const categoryDir = path.join(PUBLIC_ROOT, 'categories');
  await fs.mkdir(productDir, { recursive: true });
  await fs.mkdir(categoryDir, { recursive: true });

  const jobs = [];
  for (const group of menu) {
    const catFile = categorySlug(group.categoryImage);
    jobs.push({ url: group.categoryImage, target: path.join(categoryDir, catFile) });

    for (const item of group.items) {
      if (!item.imageUrl || item.imageUrl.endsWith(PLACEHOLDER)) continue;
      const slug = sourceSlug(item.sourceUrl);
      jobs.push({
        url: item.imageUrl.replace(/_md(?=\.)/, '_lg'),
        fallbackUrl: item.imageUrl,
        target: path.join(productDir, `${slug}${extension(item.imageUrl)}`),
      });
    }
  }

  let downloaded = 0;
  let failed = 0;
  const queue = [...jobs];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const job = queue.shift();
      try {
        try {
          await download(job.url, job.target);
        } catch (error) {
          if (!job.fallbackUrl) throw error;
          await download(job.fallbackUrl, job.target);
        }
        downloaded += 1;
      } catch (error) {
        failed += 1;
        console.warn(`تعذّر تنزيل ${job.url}: ${error.message}`);
      }
    }
  });

  await Promise.all(workers);
  console.log(`تم تنزيل ${downloaded} صورة. فشل: ${failed}.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error('فشل تنزيل صور المنيو:', error);
  process.exit(1);
});
