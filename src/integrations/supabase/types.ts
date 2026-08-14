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
  public: {
    Tables: {
      backtests: {
        Row: {
          created_at: string
          equity_curve: Json | null
          from_date: string | null
          id: string
          initial_balance: number
          leverage: number
          metrics: Json | null
          params: Json
          status: string
          strategy_key: string
          symbol: string
          timeframe: string
          to_date: string | null
          trades: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          equity_curve?: Json | null
          from_date?: string | null
          id?: string
          initial_balance?: number
          leverage?: number
          metrics?: Json | null
          params?: Json
          status?: string
          strategy_key: string
          symbol: string
          timeframe: string
          to_date?: string | null
          trades?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          equity_curve?: Json | null
          from_date?: string | null
          id?: string
          initial_balance?: number
          leverage?: number
          metrics?: Json | null
          params?: Json
          status?: string
          strategy_key?: string
          symbol?: string
          timeframe?: string
          to_date?: string | null
          trades?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_logs: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          level: string
          message: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          level?: string
          message: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          level?: string
          message?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_sessions: {
        Row: {
          broker_account_id: string | null
          check_seconds: number
          created_at: string
          id: string
          last_checked_at: string | null
          last_signal: string | null
          mode: string
          params: Json
          pnl: number
          started_at: string | null
          status: string
          stopped_at: string | null
          strategy_key: string
          strategy_label: string
          symbol: string
          timeframe: string
          trades_count: number
          updated_at: string
          user_id: string
          wins_count: number
        }
        Insert: {
          broker_account_id?: string | null
          check_seconds?: number
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_signal?: string | null
          mode?: string
          params?: Json
          pnl?: number
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          strategy_key: string
          strategy_label: string
          symbol: string
          timeframe: string
          trades_count?: number
          updated_at?: string
          user_id: string
          wins_count?: number
        }
        Update: {
          broker_account_id?: string | null
          check_seconds?: number
          created_at?: string
          id?: string
          last_checked_at?: string | null
          last_signal?: string | null
          mode?: string
          params?: Json
          pnl?: number
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          strategy_key?: string
          strategy_label?: string
          symbol?: string
          timeframe?: string
          trades_count?: number
          updated_at?: string
          user_id?: string
          wins_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "bot_sessions_broker_account_id_fkey"
            columns: ["broker_account_id"]
            isOneToOne: false
            referencedRelation: "broker_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_trades: {
        Row: {
          closed_at: string | null
          created_at: string
          entry_price: number
          exit_price: number | null
          id: string
          opened_at: string
          outcome_mode: string
          pnl: number | null
          session_id: string | null
          side: string
          status: string
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          ticket: string | null
          updated_at: string
          user_id: string
          volume: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          entry_price: number
          exit_price?: number | null
          id?: string
          opened_at?: string
          outcome_mode?: string
          pnl?: number | null
          session_id?: string | null
          side: string
          status?: string
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          ticket?: string | null
          updated_at?: string
          user_id: string
          volume: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          entry_price?: number
          exit_price?: number | null
          id?: string
          opened_at?: string
          outcome_mode?: string
          pnl?: number | null
          session_id?: string | null
          side?: string
          status?: string
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          ticket?: string | null
          updated_at?: string
          user_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "bot_trades_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "bot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_accounts: {
        Row: {
          broker: string | null
          created_at: string
          id: string
          is_connected: boolean
          last_connected_at: string | null
          login: string
          platform: string
          server: string
          updated_at: string
          user_id: string
        }
        Insert: {
          broker?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean
          last_connected_at?: string | null
          login: string
          platform?: string
          server: string
          updated_at?: string
          user_id: string
        }
        Update: {
          broker?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean
          last_connected_at?: string | null
          login?: string
          platform?: string
          server?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      drawings: {
        Row: {
          created_at: string
          id: string
          payload: Json
          symbol: string
          timeframe: string
          tool: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          symbol: string
          timeframe: string
          tool: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          symbol?: string
          timeframe?: string
          tool?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      indicator_settings: {
        Row: {
          color: string | null
          created_at: string
          enabled: boolean
          id: string
          indicator: string
          params: Json
          sort_order: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          indicator: string
          params?: Json
          sort_order?: number
          symbol?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          indicator?: string
          params?: Json
          sort_order?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      replay_sessions: {
        Row: {
          created_at: string
          cursor_index: number
          id: string
          is_playing: boolean
          speed: number
          start_time: string | null
          symbol: string
          timeframe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cursor_index?: number
          id?: string
          is_playing?: boolean
          speed?: number
          start_time?: string | null
          symbol: string
          timeframe: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cursor_index?: number
          id?: string
          is_playing?: boolean
          speed?: number
          start_time?: string | null
          symbol?: string
          timeframe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_configs: {
        Row: {
          created_at: string
          id: string
          params: Json
          strategy_key: string
          symbol: string
          timeframe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          params?: Json
          strategy_key: string
          symbol: string
          timeframe: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          params?: Json
          strategy_key?: string
          symbol?: string
          timeframe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          anthropic_api_key: string | null
          autosave: boolean
          chart_theme: string
          created_at: string
          crosshair_color: string
          default_symbol: string
          default_timeframe: string
          down_color: string
          font: string
          grid_color: string
          label_background: string
          label_text: string
          language: string
          pane_height: number
          show_crosshair: boolean
          show_grid: boolean
          show_volume: boolean
          theme: string
          up_color: string
          updated_at: string
          user_id: string
          volume_height: number
          watermark_color: string
          watermark_text: string
          wick_color: string
        }
        Insert: {
          anthropic_api_key?: string | null
          autosave?: boolean
          chart_theme?: string
          created_at?: string
          crosshair_color?: string
          default_symbol?: string
          default_timeframe?: string
          down_color?: string
          font?: string
          grid_color?: string
          label_background?: string
          label_text?: string
          language?: string
          pane_height?: number
          show_crosshair?: boolean
          show_grid?: boolean
          show_volume?: boolean
          theme?: string
          up_color?: string
          updated_at?: string
          user_id: string
          volume_height?: number
          watermark_color?: string
          watermark_text?: string
          wick_color?: string
        }
        Update: {
          anthropic_api_key?: string | null
          autosave?: boolean
          chart_theme?: string
          created_at?: string
          crosshair_color?: string
          default_symbol?: string
          default_timeframe?: string
          down_color?: string
          font?: string
          grid_color?: string
          label_background?: string
          label_text?: string
          language?: string
          pane_height?: number
          show_crosshair?: boolean
          show_grid?: boolean
          show_volume?: boolean
          theme?: string
          up_color?: string
          updated_at?: string
          user_id?: string
          volume_height?: number
          watermark_color?: string
          watermark_text?: string
          wick_color?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          balance: number
          created_at: string
          email: string | null
          id: string
          locked: boolean
          mt5_connected: boolean
          mt5_details: Json | null
          mt5_status: string | null
          page_locks: Json
          subscribed: boolean
          subscription_amount: number | null
          subscription_network: string | null
          subscription_plan: string | null
          subscription_status: string | null
          trading_outcome_mode: string
          updated_at: string
          wallet_address: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          email?: string | null
          id: string
          locked?: boolean
          mt5_connected?: boolean
          mt5_details?: Json | null
          mt5_status?: string | null
          page_locks?: Json
          subscribed?: boolean
          subscription_amount?: number | null
          subscription_network?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          trading_outcome_mode?: string
          updated_at?: string
          wallet_address?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          email?: string | null
          id?: string
          locked?: boolean
          mt5_connected?: boolean
          mt5_details?: Json | null
          mt5_status?: string | null
          page_locks?: Json
          subscribed?: boolean
          subscription_amount?: number | null
          subscription_network?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          trading_outcome_mode?: string
          updated_at?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      account_change_requests: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          status: string
          type: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          status?: string
          type?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          status?: string
          type?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      manual_trades: {
        Row: {
          closed_at: string | null
          created_at: string
          dir: number
          entry_price: number
          exit_price: number | null
          id: string
          lots: number
          opened_at: string
          outcome_mode: string
          pnl: number | null
          status: string
          symbol: string
          trade_type: string
          updated_at: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          dir?: number
          entry_price?: number
          exit_price?: number | null
          id?: string
          lots?: number
          opened_at?: string
          outcome_mode?: string
          pnl?: number | null
          status?: string
          symbol: string
          trade_type?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          dir?: number
          entry_price?: number
          exit_price?: number | null
          id?: string
          lots?: number
          opened_at?: string
          outcome_mode?: string
          pnl?: number | null
          status?: string
          symbol?: string
          trade_type?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mt5_requests: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          login: string | null
          password: string | null
          server: string | null
          status: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          login?: string | null
          password?: string | null
          server?: string | null
          status?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          login?: string | null
          password?: string | null
          server?: string | null
          status?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      subscription_requests: {
        Row: {
          amount: number
          created_at: string
          id: string
          network: string | null
          status: string
          subscription_plan: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          network?: string | null
          status?: string
          subscription_plan?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          network?: string | null
          status?: string
          subscription_plan?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      topups: {
        Row: {
          address: string | null
          amount: number
          created_at: string
          id: string
          network: string | null
          status: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          amount: number
          created_at?: string
          id?: string
          network?: string | null
          status?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          amount?: number
          created_at?: string
          id?: string
          network?: string | null
          status?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          address: string | null
          amount: number
          created_at: string
          id: string
          network: string | null
          status: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          amount: number
          created_at?: string
          id?: string
          network?: string | null
          status?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          amount?: number
          created_at?: string
          id?: string
          network?: string | null
          status?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order?: number
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
