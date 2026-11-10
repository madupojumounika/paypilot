import mongoose from 'mongoose';

const approvalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  merchant: { type: String, required: true, trim: true, maxlength: 120 },
  item: { type: String, required: true, trim: true, maxlength: 180 },
  category: { type: String, default: 'shopping', lowercase: true, trim: true },
  amount: { type: Number, required: true, min: 0.01 },
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  decisionAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('Approval', approvalSchema);
