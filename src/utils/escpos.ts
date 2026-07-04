// ESC/POS standard control characters & commands
export const ESC = '\x1b';
export const GS = '\x1d';

export const ESC_POS_COMMANDS = {
  RESET: `${ESC}@`,
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  FONT_A: `${ESC}M\x00`,
  FONT_B: `${ESC}M\x01`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  UNDERLINE_ON: `${ESC}-\x01`,
  UNDERLINE_OFF: `${ESC}-\x00`,
  DOUBLE_HEIGHT_ON: `${GS}!\x01`,
  DOUBLE_WIDTH_ON: `${GS}!\x10`,
  DOUBLE_SIZE_ON: `${GS}!\x11`,
  DOUBLE_SIZE_OFF: `${GS}!\x00`,
  PAPER_CUT: `${GS}V\x41\x00`, // Full cut
  PAPER_PARTIAL_CUT: `${GS}V\x42\x00`, // Partial cut
};

export interface EscPosItem {
  id: string;
  nama: string;
  jumlah: number;
  harga: number;
}

export interface EscPosInvoice {
  nomor_invoice: string;
  items: EscPosItem[];
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method: 'cash' | 'qris';
  cash?: number;
  change?: number;
  created_at?: string;
}

export interface EscPosSettings {
  store_name: string;
  store_address: string | null;
  receipt_header: string | null;
  receipt_footer: string | null;
  tax_enabled: boolean;
  tax_rate: number;
}

/**
 * Stub generator for ESC/POS printer byte streams.
 * Currently returns an empty Uint8Array buffer as a scaffold placeholder.
 */
export function generateEscPosReceipt(
  invoice: EscPosInvoice,
  settings: EscPosSettings,
  cashierName: string
): Uint8Array {
  // ESC/POS hardware generation scaffold - deferred to hardware integration phase
  console.log('Generating ESC/POS receipt bytes for:', invoice.nomor_invoice);
  return new Uint8Array();
}
