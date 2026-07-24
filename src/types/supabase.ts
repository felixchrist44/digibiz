export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          detail: Json | null
          id: string
          target_id: string | null
          target_name: string | null
          target_type: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_name?: string | null
          target_type?: string | null
          tenant_id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_name?: string | null
          target_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_stats_cache: {
        Row: {
          id: number
          low_stock_count: number
          out_of_stock_count: number
          tenant_id: string
          total_products: number
          total_revenue: number
          total_sales_count: number
          updated_at: string | null
        }
        Insert: {
          id?: number
          low_stock_count?: number
          out_of_stock_count?: number
          tenant_id?: string
          total_products?: number
          total_revenue?: number
          total_sales_count?: number
          updated_at?: string | null
        }
        Update: {
          id?: number
          low_stock_count?: number
          out_of_stock_count?: number
          tenant_id?: string
          total_products?: number
          total_revenue?: number
          total_sales_count?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_stats_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      detail_penjualan: {
        Row: {
          created_at: string
          harga_modal_satuan: number | null
          harga_satuan: number
          id: string
          jumlah: number
          penjualan_id: string
          produk_id: string | null
          subtotal: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          harga_modal_satuan?: number | null
          harga_satuan: number
          id?: string
          jumlah: number
          penjualan_id: string
          produk_id?: string | null
          subtotal: number
          tenant_id?: string
        }
        Update: {
          created_at?: string
          harga_modal_satuan?: number | null
          harga_satuan?: number
          id?: string
          jumlah?: number
          penjualan_id?: string
          produk_id?: string | null
          subtotal?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "detail_penjualan_penjualan_id_fkey"
            columns: ["penjualan_id"]
            isOneToOne: false
            referencedRelation: "penjualan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detail_penjualan_produk_id_fkey"
            columns: ["produk_id"]
            isOneToOne: false
            referencedRelation: "produk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detail_penjualan_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_counters: {
        Row: {
          last_seq: number
          tanggal: string
          tenant_id: string
        }
        Insert: {
          last_seq?: number
          tanggal: string
          tenant_id: string
        }
        Update: {
          last_seq?: number
          tanggal?: string
          tenant_id?: string
        }
        Relationships: []
      }
      kasir_shift: {
        Row: {
          cashier_id: string
          cashier_name: string
          closed_at: string | null
          closing_cash: number | null
          closing_qris: number | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          status: string
          tenant_id: string
          total_sales_cash: number | null
          total_sales_qris: number | null
          total_transactions: number | null
        }
        Insert: {
          cashier_id: string
          cashier_name: string
          closed_at?: string | null
          closing_cash?: number | null
          closing_qris?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          status?: string
          tenant_id: string
          total_sales_cash?: number | null
          total_sales_qris?: number | null
          total_transactions?: number | null
        }
        Update: {
          cashier_id?: string
          cashier_name?: string
          closed_at?: string | null
          closing_cash?: number | null
          closing_qris?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          status?: string
          tenant_id?: string
          total_sales_cash?: number | null
          total_sales_qris?: number | null
          total_transactions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kasir_shift_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      penjualan: {
        Row: {
          created_at: string
          dibuat_oleh: string | null
          id: string
          idempotency_key: string | null
          nomor_invoice: string
          payment_method: string
          shift_id: string | null
          tax_amount: number
          tax_enabled: boolean
          tenant_id: string
          total_harga: number
        }
        Insert: {
          created_at?: string
          dibuat_oleh?: string | null
          id?: string
          idempotency_key?: string | null
          nomor_invoice: string
          payment_method?: string
          shift_id?: string | null
          tax_amount?: number
          tax_enabled?: boolean
          tenant_id?: string
          total_harga: number
        }
        Update: {
          created_at?: string
          dibuat_oleh?: string | null
          id?: string
          idempotency_key?: string | null
          nomor_invoice?: string
          payment_method?: string
          shift_id?: string | null
          tax_amount?: number
          tax_enabled?: boolean
          tenant_id?: string
          total_harga?: number
        }
        Relationships: [
          {
            foreignKeyName: "penjualan_dibuat_oleh_fkey"
            columns: ["dibuat_oleh"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penjualan_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "kasir_shift"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penjualan_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      produk: {
        Row: {
          created_at: string
          deskripsi: string | null
          gambar_url: string | null
          harga: number
          harga_modal: number | null
          id: string
          is_generated: boolean | null
          kode_produk: string
          nama: string
          stok_saat_ini: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          deskripsi?: string | null
          gambar_url?: string | null
          harga: number
          harga_modal?: number | null
          id?: string
          is_generated?: boolean | null
          kode_produk: string
          nama: string
          stok_saat_ini?: number
          tenant_id?: string
        }
        Update: {
          created_at?: string
          deskripsi?: string | null
          gambar_url?: string | null
          harga?: number
          harga_modal?: number | null
          id?: string
          is_generated?: boolean | null
          kode_produk?: string
          nama?: string
          stok_saat_ini?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produk_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stok_log: {
        Row: {
          created_at: string
          dibuat_oleh: string | null
          id: string
          jumlah: number
          keterangan: string | null
          produk_id: string
          tenant_id: string
          tipe: string
        }
        Insert: {
          created_at?: string
          dibuat_oleh?: string | null
          id?: string
          jumlah: number
          keterangan?: string | null
          produk_id: string
          tenant_id?: string
          tipe: string
        }
        Update: {
          created_at?: string
          dibuat_oleh?: string | null
          id?: string
          jumlah?: number
          keterangan?: string | null
          produk_id?: string
          tenant_id?: string
          tipe?: string
        }
        Relationships: [
          {
            foreignKeyName: "stok_log_dibuat_oleh_fkey"
            columns: ["dibuat_oleh"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stok_log_produk_id_fkey"
            columns: ["produk_id"]
            isOneToOne: false
            referencedRelation: "produk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stok_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          role: string | null
          tenant_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          role?: string | null
          tenant_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          role?: string | null
          tenant_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          created_at: string
          receipt_footer: string | null
          receipt_header: string | null
          store_address: string | null
          store_name: string
          tax_enabled: boolean
          tax_rate: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          receipt_footer?: string | null
          receipt_header?: string | null
          store_address?: string | null
          store_name: string
          tax_enabled?: boolean
          tax_rate?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          receipt_footer?: string | null
          receipt_header?: string | null
          store_address?: string | null
          store_name?: string
          tax_enabled?: boolean
          tax_rate?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          nama_toko: string
          tipe_bisnis: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nama_toko: string
          tipe_bisnis?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nama_toko?: string
          tipe_bisnis?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      daily_sales_summary_mv: {
        Row: {
          nama_produk: string | null
          produk_id: string | null
          sku_produk: string | null
          tanggal: string | null
          tenant_id: string | null
          total_laba: number | null
          total_pendapatan: number | null
          total_terjual: number | null
        }
        Relationships: []
      }
      daily_sales_summary_mv_internal: {
        Row: {
          nama_produk: string | null
          produk_id: string | null
          sku_produk: string | null
          tanggal: string | null
          tenant_id: string | null
          total_laba: number | null
          total_pendapatan: number | null
          total_terjual: number | null
        }
        Relationships: [
          {
            foreignKeyName: "detail_penjualan_produk_id_fkey"
            columns: ["produk_id"]
            isOneToOne: false
            referencedRelation: "produk"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penjualan_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_sales_summary: {
        Row: {
          bulan: string | null
          total_laba: number | null
          total_pendapatan: number | null
          total_terjual: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_stock_manual: {
        Args: {
          p_dibuat_oleh: string
          p_jumlah: number
          p_keterangan: string
          p_produk_id: string
          p_tipe: string
        }
        Returns: undefined
      }
      close_shift: {
        Args: {
          p_closing_cash: number
          p_closing_qris: number
          p_notes?: string
          p_shift_id: string
        }
        Returns: undefined
      }
      get_total_revenue: { Args: never; Returns: number }
      inject_tenant_id_to_jwt: { Args: { event: Json }; Returns: Json }
      nullify_penjualan: {
        Args: { p_dibuat_oleh: string; p_penjualan_id: string }
        Returns: {
          nomor_invoice: string
          total_harga: number
        }[]
      }
      open_shift: {
        Args: {
          p_cashier_id: string
          p_cashier_name: string
          p_opening_cash?: number
        }
        Returns: string
      }
      process_sale_transaction: {
        Args: {
          p_dibuat_oleh: string
          p_idempotency_key?: string
          p_items: Json
          p_nomor_invoice: string
          p_payment_method?: string
          p_shift_id?: string
          p_tax_amount?: number
          p_tax_enabled?: boolean
          p_total_harga: number
        }
        Returns: string
      }
      reconcile_dashboard_sales_stats: { Args: never; Returns: undefined }
      set_user_role: {
        Args: { p_new_role: string; p_target_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
