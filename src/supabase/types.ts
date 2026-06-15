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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked: boolean
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked?: boolean
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked?: boolean
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_invoices: {
        Row: {
          amount: number
          billing_interval: string
          created_at: string
          currency: string
          id: string
          invoice_number: string
          payment_method: string | null
          period_end: string | null
          period_start: string | null
          plan_tier: string
          provider: string
          provider_ref: string | null
          receipt_url: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          billing_interval: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_tier: string
          provider?: string
          provider_ref?: string | null
          receipt_url?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          billing_interval?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_tier?: string
          provider?: string
          provider_ref?: string | null
          receipt_url?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      groq_usage: {
        Row: {
          count: number
          day: string
          device_id: string
        }
        Insert: {
          count?: number
          day?: string
          device_id: string
        }
        Update: {
          count?: number
          day?: string
          device_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          invoice_url: string | null
          provider_invoice_id: string | null
          status: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_url?: string | null
          provider_invoice_id?: string | null
          status?: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_url?: string | null
          provider_invoice_id?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      org: {
        Row: {
          created_at: string
          created_by: string
          id: string
          join_code: string
          logo_url: string | null
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          join_code: string
          logo_url?: string | null
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          join_code?: string
          logo_url?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      org_invite: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          org_id: string
          role: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          org_id: string
          role?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invite_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org"
            referencedColumns: ["id"]
          },
        ]
      }
      org_member: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          last_active_at: string | null
          last_space_id: string | null
          last_space_name: string | null
          manual_status: string | null
          manual_status_emoji: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          last_active_at?: string | null
          last_space_id?: string | null
          last_space_name?: string | null
          manual_status?: string | null
          manual_status_emoji?: string | null
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          last_active_at?: string | null
          last_space_id?: string | null
          last_space_name?: string | null
          manual_status?: string | null
          manual_status_emoji?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_member_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org"
            referencedColumns: ["id"]
          },
        ]
      }
      org_space: {
        Row: {
          background: Json | null
          content_path: string
          created_at: string
          id: string
          local_origin_id: string | null
          name: string
          org_id: string
          owner_user_id: string
          thumb_url: string | null
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          background?: Json | null
          content_path: string
          created_at?: string
          id?: string
          local_origin_id?: string | null
          name: string
          org_id: string
          owner_user_id: string
          thumb_url?: string | null
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          background?: Json | null
          content_path?: string
          created_at?: string
          id?: string
          local_origin_id?: string | null
          name?: string
          org_id?: string
          owner_user_id?: string
          thumb_url?: string | null
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_space_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "org"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount_cents: number
          billing_interval: string
          created_at: string
          currency: string
          error_code: string | null
          error_description: string | null
          id: string
          invoice_id: string | null
          metadata: Json
          payment_method: string | null
          plan_id: string
          plan_tier: string
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          provider_signature: string | null
          receipt_url: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          billing_interval: string
          created_at?: string
          currency?: string
          error_code?: string | null
          error_description?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          payment_method?: string | null
          plan_id: string
          plan_tier: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_signature?: string | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          billing_interval?: string
          created_at?: string
          currency?: string
          error_code?: string | null
          error_description?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          payment_method?: string | null
          plan_id?: string
          plan_tier?: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_signature?: string | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          features: Json
          id: string
          interval: string
          limits: Json
          name: string
          price_cents: number
          tier: string
        }
        Insert: {
          created_at?: string
          currency?: string
          features?: Json
          id: string
          interval: string
          limits?: Json
          name: string
          price_cents: number
          tier: string
        }
        Update: {
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          interval?: string
          limits?: Json
          name?: string
          price_cents?: number
          tier?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          default_workspace_id: string | null
          display_name: string | null
          email: string | null
          id: string
          notifications_enabled: boolean
          role: string | null
          swarms_started: number
          tasks_created: number
          theme: string
          tier: string
          timezone: string | null
          updated_at: string
          usage_month: string
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          default_workspace_id?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          notifications_enabled?: boolean
          role?: string | null
          swarms_started?: number
          tasks_created?: number
          theme?: string
          tier?: string
          timezone?: string | null
          updated_at?: string
          usage_month?: string
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          default_workspace_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          notifications_enabled?: boolean
          role?: string | null
          swarms_started?: number
          tasks_created?: number
          theme?: string
          tier?: string
          timezone?: string | null
          updated_at?: string
          usage_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_workspace_id_fkey"
            columns: ["default_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_states: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          state: Json
          swarm_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          state: Json
          swarm_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          state?: Json
          swarm_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swarm_states_swarm_id_fkey"
            columns: ["swarm_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
        ]
      }
      swarms: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          name: string
          root_dir: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          root_dir: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          root_dir?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      terminal_layouts: {
        Row: {
          command_blocks: Json
          created_at: string
          id: string
          is_current: boolean
          layout: Json
          pane_agents: Json
          pane_order: Json
          pane_shells: Json
          preset_id: string | null
          tasks: Json
          updated_at: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          command_blocks?: Json
          created_at?: string
          id?: string
          is_current?: boolean
          layout: Json
          pane_agents?: Json
          pane_order?: Json
          pane_shells?: Json
          preset_id?: string | null
          tasks?: Json
          updated_at?: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          command_blocks?: Json
          created_at?: string
          id?: string
          is_current?: boolean
          layout?: Json
          pane_agents?: Json
          pane_order?: Json
          pane_shells?: Json
          preset_id?: string | null
          tasks?: Json
          updated_at?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_layouts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          period_end: string
          period_start: string
          swarms_started: number
          tasks_created: number
          updated_at: string
          user_id: string
        }
        Insert: {
          period_end: string
          period_start: string
          swarms_started?: number
          tasks_created?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          period_end?: string
          period_start?: string
          swarms_started?: number
          tasks_created?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          amount: number
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          active_pane_id: string | null
          created_at: string
          id: string
          metadata: Json
          name: string
          root_dir: string
          selected_model: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_pane_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          root_dir: string
          selected_model?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_pane_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          root_dir?: string
          selected_model?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_groq_usage: { Args: { p_device_id: string }; Returns: number }
      clerk_sub: { Args: never; Returns: string }
      clerk_sub_probe: { Args: never; Returns: string }
      complete_subscription_checkout:
        | {
            Args: {
              p_billing_interval: string
              p_payment_method?: string
              p_plan_id: string
              p_provider_ref?: string
              p_receipt_url?: string
            }
            Returns: {
              amount: number
              billing_interval: string
              created_at: string
              currency: string
              id: string
              invoice_number: string
              payment_method: string | null
              period_end: string | null
              period_start: string | null
              plan_tier: string
              provider: string
              provider_ref: string | null
              receipt_url: string | null
              status: string
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "billing_invoices"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_billing_interval: string
              p_payment_method?: string
              p_plan_id: string
              p_provider?: string
              p_provider_ref?: string
              p_receipt_url?: string
              p_user_id_override?: string
            }
            Returns: {
              amount: number
              billing_interval: string
              created_at: string
              currency: string
              id: string
              invoice_number: string
              payment_method: string | null
              period_end: string | null
              period_start: string | null
              plan_tier: string
              provider: string
              provider_ref: string | null
              receipt_url: string | null
              status: string
              user_id: string
            }
            SetofOptions: {
              from: "*"
              to: "billing_invoices"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      create_api_key: {
        Args: { api_name: string; scopes_in?: string[] }
        Returns: {
          created_at: string
          id: string
          key: string
          key_prefix: string
          last_used_at: string
          name: string
          revoked: boolean
          scopes_out: string[]
        }[]
      }
      is_org_admin: {
        Args: { p_org: string; p_user: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { p_org: string; p_user: string }
        Returns: boolean
      }
      record_usage_event: {
        Args: { amount?: number; event_type: string }
        Returns: undefined
      }
      revoke_api_key: { Args: { api_key_id: string }; Returns: undefined }
      start_subscription: { Args: { plan_id: string }; Returns: string }
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
  public: {
    Enums: {},
  },
} as const
