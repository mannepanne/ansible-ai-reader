// ABOUT: Supabase Database types generated from the live schema (do not edit by hand)
// ABOUT: Regenerate with `npm run db:types` after every migration; the Database generic on every client comes from here

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
      agent_session_runs: {
        Row: {
          attempt: number
          cache_creation_input_tokens: number | null
          cache_read_input_tokens: number | null
          created_at: string
          degraded: string | null
          error: string | null
          id: string
          input_tokens: number | null
          output_tokens: number | null
          piece_id: string | null
          reader_id: string
          session_id: string | null
          started_at: string | null
          state: string
          updated_at: string
        }
        Insert: {
          attempt?: number
          cache_creation_input_tokens?: number | null
          cache_read_input_tokens?: number | null
          created_at?: string
          degraded?: string | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          piece_id?: string | null
          reader_id: string
          session_id?: string | null
          started_at?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          cache_creation_input_tokens?: number | null
          cache_read_input_tokens?: number | null
          created_at?: string
          degraded?: string | null
          error?: string | null
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          piece_id?: string | null
          reader_id?: string
          session_id?: string | null
          started_at?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      demo_events: {
        Row: {
          created_at: string | null
          email: string | null
          event_data: Json | null
          event_type: string
          id: string
          session_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          session_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          session_id?: string
        }
        Relationships: []
      }
      demo_sessions: {
        Row: {
          email: string | null
          id: string
          last_active_at: string | null
          session_id: string
          started_at: string | null
          total_events: number | null
        }
        Insert: {
          email?: string | null
          id?: string
          last_active_at?: string | null
          session_id: string
          started_at?: string | null
          total_events?: number | null
        }
        Update: {
          email?: string | null
          id?: string
          last_active_at?: string | null
          session_id?: string
          started_at?: string | null
          total_events?: number | null
        }
        Relationships: []
      }
      email_captures: {
        Row: {
          consented: boolean
          consented_at: string | null
          created_at: string | null
          email: string
          id: string
          source: string
        }
        Insert: {
          consented: boolean
          consented_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          source: string
        }
        Update: {
          consented?: boolean
          consented_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      fika_batch_items: {
        Row: {
          batch_id: string
          carried_from: string | null
          item_id: string
          slot: number
        }
        Insert: {
          batch_id: string
          carried_from?: string | null
          item_id: string
          slot: number
        }
        Update: {
          batch_id?: string
          carried_from?: string | null
          item_id?: string
          slot?: number
        }
        Relationships: [
          {
            foreignKeyName: "fika_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "fika_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fika_batch_items_carried_from_fkey"
            columns: ["carried_from"]
            isOneToOne: false
            referencedRelation: "fika_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fika_batch_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "reader_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fika_batches: {
        Row: {
          batch_date: string
          created_at: string
          id: string
          resend_message_id: string | null
          send_attempts: number
          sent_at: string | null
          user_id: string
        }
        Insert: {
          batch_date: string
          created_at?: string
          id?: string
          resend_message_id?: string | null
          send_attempts?: number
          sent_at?: string | null
          user_id: string
        }
        Update: {
          batch_date?: string
          created_at?: string
          id?: string
          resend_message_id?: string | null
          send_attempts?: number
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fika_batches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      item_signals: {
        Row: {
          created_at: string
          id: string
          item_id: string
          signal_type: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          signal_type: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          signal_type?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_signals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "reader_items"
            referencedColumns: ["id"]
          },
        ]
      }
      page_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          session_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          session_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          session_id?: string
          visitor_id?: string
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          job_type: string
          max_attempts: number | null
          reader_item_id: string | null
          regenerate_batch_id: string | null
          started_at: string | null
          status: string
          sync_log_id: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_type: string
          max_attempts?: number | null
          reader_item_id?: string | null
          regenerate_batch_id?: string | null
          started_at?: string | null
          status?: string
          sync_log_id?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_type?: string
          max_attempts?: number | null
          reader_item_id?: string | null
          regenerate_batch_id?: string | null
          started_at?: string | null
          status?: string
          sync_log_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_reader_item_id_fkey"
            columns: ["reader_item_id"]
            isOneToOne: false
            referencedRelation: "reader_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_jobs_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_items: {
        Row: {
          archive_reason: string | null
          archived: boolean | null
          archived_at: string | null
          author: string | null
          commentariat_generated_at: string | null
          commentariat_summary: string | null
          content: string | null
          content_truncated: boolean | null
          content_type: string | null
          created_at: string | null
          document_note: string | null
          highlights_count: number
          id: string
          long_summary: string | null
          perplexity_model: string | null
          rating: number | null
          reader_deleted: boolean
          reader_id: string
          reader_note: string | null
          relay_gate_code: string | null
          relay_gate_signals: Json
          relay_triggered_at: string | null
          short_summary: string | null
          source: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          url: string
          user_id: string | null
          word_count: number | null
        }
        Insert: {
          archive_reason?: string | null
          archived?: boolean | null
          archived_at?: string | null
          author?: string | null
          commentariat_generated_at?: string | null
          commentariat_summary?: string | null
          content?: string | null
          content_truncated?: boolean | null
          content_type?: string | null
          created_at?: string | null
          document_note?: string | null
          highlights_count?: number
          id?: string
          long_summary?: string | null
          perplexity_model?: string | null
          rating?: number | null
          reader_deleted?: boolean
          reader_id: string
          reader_note?: string | null
          relay_gate_code?: string | null
          relay_gate_signals?: Json
          relay_triggered_at?: string | null
          short_summary?: string | null
          source?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          url: string
          user_id?: string | null
          word_count?: number | null
        }
        Update: {
          archive_reason?: string | null
          archived?: boolean | null
          archived_at?: string | null
          author?: string | null
          commentariat_generated_at?: string | null
          commentariat_summary?: string | null
          content?: string | null
          content_truncated?: boolean | null
          content_type?: string | null
          created_at?: string | null
          document_note?: string | null
          highlights_count?: number
          id?: string
          long_summary?: string | null
          perplexity_model?: string | null
          rating?: number | null
          reader_deleted?: boolean
          reader_id?: string
          reader_note?: string | null
          relay_gate_code?: string | null
          relay_gate_signals?: Json
          relay_triggered_at?: string | null
          short_summary?: string | null
          source?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          url?: string
          user_id?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reader_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      relay_decisions: {
        Row: {
          created_at: string | null
          degraded: string | null
          id: string
          piece_id: string | null
          reason: string | null
          sources: Json
          stimulus_ref: string[] | null
          verdict: Database["public"]["Enums"]["relay_decision_verdict_enum"]
        }
        Insert: {
          created_at?: string | null
          degraded?: string | null
          id?: string
          piece_id?: string | null
          reason?: string | null
          sources?: Json
          stimulus_ref?: string[] | null
          verdict: Database["public"]["Enums"]["relay_decision_verdict_enum"]
        }
        Update: {
          created_at?: string | null
          degraded?: string | null
          id?: string
          piece_id?: string | null
          reason?: string | null
          sources?: Json
          stimulus_ref?: string[] | null
          verdict?: Database["public"]["Enums"]["relay_decision_verdict_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "relay_decisions_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "relay_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      relay_pieces: {
        Row: {
          body: string
          concepts: string[] | null
          created_at: string | null
          decided_at: string | null
          deployed_at: string | null
          embedding: string | null
          id: string
          links: Json | null
          original_body: string | null
          review_note: string | null
          slug: string | null
          state: Database["public"]["Enums"]["relay_piece_state_enum"]
          summary: string | null
          verification_status: string
        }
        Insert: {
          body: string
          concepts?: string[] | null
          created_at?: string | null
          decided_at?: string | null
          deployed_at?: string | null
          embedding?: string | null
          id?: string
          links?: Json | null
          original_body?: string | null
          review_note?: string | null
          slug?: string | null
          state?: Database["public"]["Enums"]["relay_piece_state_enum"]
          summary?: string | null
          verification_status?: string
        }
        Update: {
          body?: string
          concepts?: string[] | null
          created_at?: string | null
          decided_at?: string | null
          deployed_at?: string | null
          embedding?: string | null
          id?: string
          links?: Json | null
          original_body?: string | null
          review_note?: string | null
          slug?: string | null
          state?: Database["public"]["Enums"]["relay_piece_state_enum"]
          summary?: string | null
          verification_status?: string
        }
        Relationships: []
      }
      relay_references: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          origin: string
          source_ref: string | null
          title: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          origin: string
          source_ref?: string | null
          title?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          origin?: string
          source_ref?: string | null
          title?: string | null
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          completed_at: string | null
          created_at: string | null
          errors: Json | null
          estimated_cost: number | null
          id: string
          items_created: number | null
          items_failed: number | null
          items_fetched: number | null
          started_at: string | null
          sync_type: string | null
          token_usage: Json | null
          triggered_by: string | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          errors?: Json | null
          estimated_cost?: number | null
          id?: string
          items_created?: number | null
          items_failed?: number | null
          items_fetched?: number | null
          started_at?: string | null
          sync_type?: string | null
          token_usage?: Json | null
          triggered_by?: string | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          errors?: Json | null
          estimated_cost?: number | null
          id?: string
          items_created?: number | null
          items_failed?: number | null
          items_fetched?: number | null
          started_at?: string | null
          sync_type?: string | null
          token_usage?: Json | null
          triggered_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          drift_days: number
          email: string
          fika_hour: number | null
          id: string
          is_admin: boolean
          last_auto_sync_at: string | null
          relay_engagement_gate_enabled: boolean
          summary_prompt: string | null
          sync_interval: number | null
          timezone: string
          weekly_target: number
        }
        Insert: {
          created_at?: string | null
          drift_days?: number
          email: string
          fika_hour?: number | null
          id?: string
          is_admin?: boolean
          last_auto_sync_at?: string | null
          relay_engagement_gate_enabled?: boolean
          summary_prompt?: string | null
          sync_interval?: number | null
          timezone?: string
          weekly_target?: number
        }
        Update: {
          created_at?: string | null
          drift_days?: number
          email?: string
          fika_hour?: number | null
          id?: string
          is_admin?: boolean
          last_auto_sync_at?: string | null
          relay_engagement_gate_enabled?: boolean
          summary_prompt?: string | null
          sync_interval?: number | null
          timezone?: string
          weekly_target?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_session_events: { Args: { sid: string }; Returns: undefined }
      relay_recall: {
        Args: { match_count: number; query_embedding: string }
        Returns: {
          concepts: string[]
          distance: number
          id: string
          kind: string
          summary: string
          title: string
        }[]
      }
      update_session_heartbeat: { Args: { sid: string }; Returns: undefined }
    }
    Enums: {
      relay_decision_verdict_enum: "wrote" | "declined"
      relay_piece_state_enum: "pending_review" | "approved" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      relay_decision_verdict_enum: ["wrote", "declined"],
      relay_piece_state_enum: ["pending_review", "approved", "rejected"],
    },
  },
} as const
