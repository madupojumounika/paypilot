import mongoose from 'mongoose';

const approvalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  merchant: { type: String, required: true, trim: true, maxlength: 120 },
  item: { type: String, required: true, trim: true, maxlength: 180 },
  category: { type: String, default: 'shopping', lowercase: true, trim: true },
  amount: { type: Number, required: true, min: 0.01 },
  userGoal: { type: String, default: '', maxlength: 240 },
  recommendationSummary: { type: String, default: '', maxlength: 1200 },
  recommendationReason: { type: String, default: '', maxlength: 600 },
  rejectedAlternatives: { type: [{ product: { type: String, maxlength: 180 }, reason: { type: String, maxlength: 400 } }], default: [] },
  productUrl: { type: String, default: '', maxlength: 1000 },
  productImage: { type: String, default: '', maxlength: 1000 },
  budgetAtRequest: { type: Number, min: 0 },
  policyCheck: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
  decisionAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('Approval', approvalSchema);
