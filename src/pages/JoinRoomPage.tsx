import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const JoinRoomPage: React.FC = () => {
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isValidRoom, setIsValidRoom] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const navigate = useNavigate();

  const checkRoomStatus = async () => {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, status")
        .eq("code", roomCode)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows returned
          setIsValidRoom(false);
          setIsGameStarted(false);
        } else {
          throw error;
        }
      } else {
        setIsValidRoom(true);
        setIsGameStarted(data.status === "active");
      }
    } catch (err: any) {
      setError(err.message);
      setIsValidRoom(false);
      setIsGameStarted(false);
    }
  };

  useEffect(() => {
    if (roomCode && roomCode.length > 0) {
      checkRoomStatus();
      const interval = setInterval(checkRoomStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [roomCode]);

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !roomCode.trim()) {
      setError("Please enter both nickname and room code");
      return;
    }

    try {
      setLoading(true);
      setError("");

      // First check if room exists and is not started
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("id, status")
        .eq("code", roomCode)
        .single();

      if (roomError) {
        if (roomError.code === "PGRST116") {
          throw new Error("Room not found. Please check the room code.");
        }
        throw roomError;
      }

      if (!room) {
        throw new Error("Room not found. Please check the room code.");
      }

      if (room.status === "active") {
        throw new Error("Game has already started");
      }

      // Add player to room
      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert([
          {
            room_id: room.id,
            nickname: nickname.trim(),
            is_host: false,
            turn_order: 0, // Will be updated by the host
          },
        ])
        .select()
        .single();

      if (playerError) {
        throw new Error("Failed to join room. Please try again.");
      }

      // Store player info in session storage
      sessionStorage.setItem("playerId", player.id);
      sessionStorage.setItem("roomId", room.id);
      sessionStorage.setItem("nickname", nickname.trim());

      // Navigate to room lobby
      navigate(`/room/${roomCode}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "3rem" }}>
      <h2>Join Room</h2>
      <form onSubmit={handleJoinRoom} style={{ marginTop: "2rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="text"
            placeholder="Enter your nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
            style={{ padding: "0.5rem", fontSize: "1rem" }}
          />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="text"
            placeholder="Enter room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            required
            style={{ padding: "0.5rem", fontSize: "1rem" }}
          />
        </div>
        {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}
        {!isValidRoom && roomCode && (
          <p style={{ color: "orange", marginBottom: "1rem" }}>
            Waiting for room to be created...
          </p>
        )}
        {isValidRoom && isGameStarted && (
          <p style={{ color: "green", marginBottom: "1rem" }}>
            Game has started! Click join to enter.
          </p>
        )}
        <button
          type="submit"
          disabled={
            loading || !nickname.trim() || !roomCode.trim() || !isValidRoom
          }
          style={{
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            backgroundColor: isValidRoom ? "#4CAF50" : "#ccc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isValidRoom ? "pointer" : "not-allowed",
            opacity: isValidRoom ? 1 : 0.7,
          }}
        >
          {loading ? "Joining..." : "Join Room"}
        </button>
      </form>
    </div>
  );
};

export default JoinRoomPage;
