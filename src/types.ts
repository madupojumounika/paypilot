export type TransactionStatus = "completed" | "pending" | "declined";
export type ApprovalStatus = "approved" | "waiting" | "rejected";

export interface Transaction {
  id: string;
  merchant: string;
  category: string;
  date: string;
  amount: number;
  status: TransactionStatus;
  initials: string;
}

export interface SpendingRule {
  id: string;
  name: string;
  description: string;
  limit: number;
  spent: number;
  enabled: boolean;
}

export interface PaymentApproval {
  id: string;
  merchant: string;
  item: string;
  amount: number;
  requestedAt: string;
  status: ApprovalStatus;
}
