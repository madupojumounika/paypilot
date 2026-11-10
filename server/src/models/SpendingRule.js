import mongoose from 'mongoose';

const spendingRuleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 240 },
  category: { type: String, default: 'all', lowercase: true, trim: true },
  limit: { type: Number, required: true, min: 0 },
  spent: { type: Number, default: 0, min: 0 },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('SpendingRule', spendingRuleSchema);
