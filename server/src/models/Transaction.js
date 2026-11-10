import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  approvalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Approval' },
  merchant: { type: String, required: true },
  item: { type: String, required: true },
  category: { type: String, default: 'shopping' },
  amount: { type: Number, required: true, min: 0.01 },
  status: { type: String, enum: ['approved_pending_payment', 'declined'], required: true },
  paymentExecuted: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Transaction', transactionSchema);
