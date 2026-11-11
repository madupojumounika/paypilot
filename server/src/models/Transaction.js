import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  approvalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Approval' },
  merchant: { type: String, required: true },
  item: { type: String, required: true },
  category: { type: String, default: 'shopping' },
  amount: { type: Number, required: true, min: 0.01 }, // Original shopping amount in INR
  currency: { type: String, enum: ['INR'], default: 'INR' },
  status: { type: String, enum: ['approved_pending_payment', 'declined', 'payment_pending', 'payment_completed', 'payment_failed'], required: true },
  paymentExecuted: { type: Boolean, default: false },
  fxQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'FxQuote', default: null },
  amountUSD: { type: Number, min: 0.01, default: null },
  paypalOrderId: { type: String, default: '', index: true },
  paypalCaptureId: { type: String, default: '' },
  paymentStatus: { type: String, enum: ['NOT_STARTED', 'ORDER_CREATED', 'PENDING', 'CAPTURE_UNKNOWN', 'COMPLETED', 'FAILED', 'AMOUNT_MISMATCH'], default: 'NOT_STARTED' },
  capturedAt: { type: Date, default: null },
  receiptNumber: { type: String, default: '' },
}, { timestamps: true });

transactionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Transaction', transactionSchema);
