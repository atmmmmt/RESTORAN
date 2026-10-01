'use strict';

/**
 * WhatsApp notification service — Meta WhatsApp Cloud API.
 *
 * جاهز للتفعيل الفوري بمجرد توفّر التوكن الحقيقي (WHATSAPP_TOKEN)
 * ومعرّف رقم الهاتف (WHATSAPP_PHONE_NUMBER_ID) من Meta for Developers،
 * عبر إضافتهما إلى ملف .env بالباك اند.
 *
 * إلى أن تُضاف القيم: الدالة تكتفي بطباعة تحذير بالكونسول ولا ترمي أي
 * استثناء أبدًا — حتى لا يفشل إنشاء الطلب لمجرد أن الواتساب غير مُفعّل بعد.
 */

const WHATSAPP_API_VERSION = 'v20.0';

/**
 * يرسل رسالة نصية عبر WhatsApp Cloud API إلى رقم هاتف معيّن.
 * @param {string} phone - رقم هاتف المستلم (صيغة دولية بدون + أو مسافات، مثال: 9639XXXXXXXX)
 * @param {string} message - نص الرسالة
 * @returns {Promise<void>}
 */
async function sendOrderNotification(phone, message) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn('⚠️ إعدادات واتساب غير مكتملة — لم يُرسل الإشعار');
    return;
  }

  if (!phone) {
    console.warn('⚠️ لا يوجد رقم هاتف لإرسال إشعار واتساب إليه — لم يُرسل الإشعار');
    return;
  }

  try {
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('❌ فشل إرسال إشعار واتساب:', response.status, errorBody);
      return;
    }
  } catch (error) {
    console.error('❌ خطأ أثناء إرسال إشعار واتساب:', error.message || error);
  }
}

/**
 * يبني نص إشعار "طلب جديد" جاهز لإرساله لمدير الفرع.
 */
function buildOrderNotificationMessage({
  customerName,
  phone,
  productName,
  quantity,
  deliveryMethod,
  location,
}) {
  const deliveryLabel = deliveryMethod === 'pickup' ? 'استلام شخصي' : 'توصيل';
  return [
    '📦 طلب جديد على فرعكم!',
    `الزبون: ${customerName || '-'}`,
    `الهاتف: ${phone || '-'}`,
    `المنتج: ${productName || '-'} × ${quantity || 1}`,
    `طريقة الاستلام: ${deliveryLabel}`,
    `الموقع: ${location || '-'}`,
  ].join('\n');
}

module.exports = {
  sendOrderNotification,
  buildOrderNotificationMessage,
};
