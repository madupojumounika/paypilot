import mongoose from 'mongoose';

const fxQuoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  approvalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Approval', required: true, index: true },
  sourceAmountINR: { type: Number, required: true, min: 0.01 },
  targetAmountUSD: { type: Number, required: true, min: 0.01 },
  rateINRPerUSD: { type: Number, required: true, min: 0.000001 },
  rateUSDPerINR: { type: Number, required: true, min: 0.0000001 },
  rateDate: { type: String, required: true },
  provider: { type: String, required: true, default: 'European Central Bank via Frankfurter' },
  fetchedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
  status: { type: String, enum: ['quoted', 'accepted', 'expired'], default: 'quoted' },
}, { timestamps: true, versionKey: false });

fxQuoteSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('FxQuote', fxQuoteSchema);
