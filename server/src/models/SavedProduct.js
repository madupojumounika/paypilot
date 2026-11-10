import mongoose from 'mongoose';

const savedProductSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  url: { type: String, required: true, trim: true, maxlength: 2048 },
  merchant: { type: String, required: true, trim: true, maxlength: 120 },
  image: { type: String, default: null, maxlength: 2048 },
  price: { type: String, default: null, maxlength: 80 },
  description: { type: String, default: null, maxlength: 1000 },
}, { timestamps: true });

savedProductSchema.index({ userId: 1, url: 1 }, { unique: true });

export default mongoose.model('SavedProduct', savedProductSchema);
