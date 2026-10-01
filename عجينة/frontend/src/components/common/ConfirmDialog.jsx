import Modal from './Modal'
import Button from './Button'

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'تأكيد', loading }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-brand-gray mb-6 leading-relaxed">{message}</p>
      <div className="flex gap-3">
        <Button variant="danger" onClick={onConfirm} loading={loading} className="flex-1">
          {confirmText}
        </Button>
        <Button variant="ghost" onClick={onClose} className="flex-1">
          إلغاء
        </Button>
      </div>
    </Modal>
  )
}
