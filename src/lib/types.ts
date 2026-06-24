/**
 * Typed shapes that match the real Shashki Royale Supabase schema
 * (extracted from supabase/*.sql migrations on 2026-06-24).
 *
 * Only fields safely readable by the `anon` role (via RLS / public_profiles
 * view) are included.  Wallet balances and transactions are NOT readable by
 * anon — they require a future server-side admin RPC (Sprint 2).
 */

export type PublicProfile = {
  id: string;
  nickname: string;
  avatar_index: number;
  avatar_url: string | null;
  display_name: string | null;
  rating: number;
  total_games: number;
  wins: number;
  losses: number;
  draws: number;
  win_streak: number;
  best_win_streak: number;
  created_at: string;
  last_seen_at: string;
};

export type GameRow = {
  id: string;
  room_code: string;
  status: "waiting" | "playing" | "finished";
  white_player_id: string;
  black_player_id: string | null;
  current_turn: "white" | "black";
  move_number: number;
  winner: "white" | "black" | null;
  resign_reason: string | null;
  created_at: string;
  updated_at: string;
  last_move_at?: string | null;
};

export type GameStakeRow = {
  id: string;
  game_id: string;
  entry_fee: number;
  pot_amount: number;
  white_profile_id: string | null;
  black_profile_id: string | null;
  escrow_status: "waiting" | "locked" | "paid" | "refunded";
  payout_status: "pending" | "paid" | "failed" | "refunded";
  created_at: string;
  updated_at: string;
};

export type MoveRow = {
  id: string;
  game_id: string;
  move_number: number;
  player_color: "white" | "black";
  move_data: unknown;
  created_at: string;
};
