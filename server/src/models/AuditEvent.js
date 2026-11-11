import mongoose from 'mongoose';

const auditEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, enum: ['purchase.requested', 'purchase.approved', 'purchase.declined', 'payment.order_created', 'payment.captured', 'payment.failed', 'fx.quote.created', 'fx.quote.accepted'] },
  entityType: { type: String, required: true, enum: ['approval', 'transaction', 'fx_quote'] },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, versionKey: false });

auditEventSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('AuditEvent', auditEventSchema);
