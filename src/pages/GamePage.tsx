import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Confetti from "react-confetti";

interface Player {
  id: string;
  nickname: string;
  is_host: boolean;
  turn_order: number;
}

interface Prompt {
  id: string;
  type: "truth" | "dare";
  content: string;
}

interface GameState {
  id: string;
  current_player_id: string;
  current_prompt_id: string;
  status: "waiting" | "active" | "ended";
  response?: string;
}

interface Response {
  id: string;
  player_id: string;
  prompt_id: string;
  response: string;
  created_at: string;
  room_id: string;
}

interface ExtendedResponse extends Response {
  players: { nickname: string };
  prompts: { content: string; type: "truth" | "dare" };
}

const GamePage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<Prompt | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedType, setSelectedType] = useState<"truth" | "dare" | null>(
    null
  );
  const [isCurrentPlayer, setIsCurrentPlayer] = useState(false);
  const [response, setResponse] = useState("");
  const [hasResponded, setHasResponded] = useState(false);
  const [responses, setResponses] = useState<ExtendedResponse[]>([]);
  const [showTypeSelection, setShowTypeSelection] = useState(true);
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [showConfetti, setShowConfetti] = useState(false);
  const [reactions, setReactions] = useState<{ [key: string]: string }>({});

  const playerId = sessionStorage.getItem("playerId");
  const roomId = sessionStorage.getItem("roomId");

  // Fetch game state
  const fetchGameState = useCallback(async () => {
    try {
      if (!roomId) return;

      const { data, error } = await supabase
        .from("game_state")
        .select("*")
        .eq("room_id", roomId)
        .single();

      if (error) throw error;
      setGameState(data);
      if (data?.current_prompt_id) {
        await fetchCurrentPrompt(data.current_prompt_id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // Fetch players
  const fetchPlayers = useCallback(async () => {
    try {
      if (!roomId) return;

      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .order("turn_order", { ascending: true });

      if (error) throw error;
      setPlayers(data || []);

      // Check if current player is the active player
      setIsCurrentPlayer(gameState?.current_player_id === playerId);
    } catch (err: any) {
      setError(err.message);
    }
  }, [gameState, playerId, roomId]);

  // Fetch current prompt
  const fetchCurrentPrompt = useCallback(async (promptId: string) => {
    try {
      const { data, error } = await supabase
        .from("prompts")
        .select("*")
        .eq("id", promptId)
        .single();

      if (error) throw error;
      setCurrentPrompt(data);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // Fetch responses
  const fetchResponses = useCallback(async () => {
    try {
      if (!roomId) return;

      const { data, error } = await supabase
        .from("responses")
        .select(
          `
          *,
          players:player_id (nickname),
          prompts:prompt_id (content, type)
        `
        )
        .eq("room_id", roomId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setResponses((data as unknown as ExtendedResponse[]) || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, [roomId]);

  useEffect(() => {
    if (!playerId || !roomId) {
      navigate("/");
      return;
    }

    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    // Subscribe to game state changes
    const gameStateSubscription = supabase
      .channel("game_state")
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload: { new: GameState }) => {
          if (payload.new) {
            setGameState(payload.new);
            if (payload.new.current_prompt_id) {
              await fetchCurrentPrompt(payload.new.current_prompt_id);
            }
            setShowTypeSelection(true);
            setSelectedType(null);
            setResponse("");
            setHasResponded(false);
          }
        }
      )
      .subscribe();

    // Subscribe to responses changes
    const responsesSubscription = supabase
      .channel("responses")
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "responses",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchResponses();
        }
      )
      .subscribe();

    // Subscribe to players changes
    const playersSubscription = supabase
      .channel("players")
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchPlayers();
        }
      )
      .subscribe();

    // Initial fetch
    fetchGameState();
    fetchPlayers();
    fetchResponses();

    return () => {
      window.removeEventListener("resize", handleResize);
      gameStateSubscription.unsubscribe();
      playersSubscription.unsubscribe();
      responsesSubscription.unsubscribe();
    };
  }, [
    roomCode,
    navigate,
    playerId,
    roomId,
    fetchGameState,
    fetchPlayers,
    fetchResponses,
    fetchCurrentPrompt,
  ]);

  const handleTypeSelection = async (type: "truth" | "dare") => {
    try {
      setSelectedType(type);
      setShowTypeSelection(false);
      setResponse("");
      setHasResponded(false);

      if (!roomId) return;

      // Fetch all prompts of the selected type
      const { data: prompts, error: promptsError } = await supabase
        .from("prompts")
        .select("*")
        .eq("type", type);

      if (promptsError) throw promptsError;
      if (!prompts || prompts.length === 0) throw new Error("No prompts found");

      // Select a random prompt
      const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

      await supabase
        .from("game_state")
        .update({
          current_prompt_id: randomPrompt.id,
        })
        .eq("room_id", roomId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSubmitResponse = async () => {
    try {
      if (!roomId || !playerId || !currentPrompt) return;

      await supabase.from("responses").insert([
        {
          room_id: roomId,
          player_id: playerId,
          prompt_id: currentPrompt.id,
          response: response.trim(),
        },
      ]);

      setHasResponded(true);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);

      // Automatically move to next turn after a short delay
      setTimeout(() => {
        handleNextTurn();
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleNextTurn = async () => {
    try {
      if (!roomId || !gameState || players.length === 0) return;

      // Get current player index
      const currentPlayerIndex = players.findIndex(
        (p) => p.id === gameState.current_player_id
      );

      // Get next player index (loop back to start if at end)
      const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
      const nextPlayer = players[nextPlayerIndex];

      // Update game state with next player
      const { error } = await supabase
        .from("game_state")
        .update({
          current_player_id: nextPlayer.id,
        })
        .eq("room_id", roomId);

      if (error) throw error;

      setShowTypeSelection(true);
      setSelectedType(null);
      setResponse("");
      setHasResponded(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addReaction = (responseId: string, emoji: string) => {
    setReactions((prev) => ({
      ...prev,
      [responseId]: emoji,
    }));
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!gameState) return <div>Game not found</div>;

  const currentPlayer = players.find(
    (p) => p.id === gameState.current_player_id
  );
  const myNickname = sessionStorage.getItem("nickname");

  // CSS styles (extracted for clarity)
  const styles = {
    container: {
      minHeight: "100vh",
      backgroundColor: "#f0f2f5",
      padding: "1rem",
      position: "relative" as const,
      overflowX: "hidden" as const,
    },
    playerHeader: {
      position: "fixed" as const,
      top: 0,
      right: 0,
      left: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0.8rem",
      backgroundColor: "#fff",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      zIndex: 1000,
    },
    playerText: {
      margin: 0,
      fontSize: "1rem",
      color: "#2c3e50",
      fontWeight: 500,
    },
    playerName: {
      color: "#3498db",
      fontWeight: "bold",
    },
    mainContent: {
      maxWidth: 1000,
      margin: "0 auto",
      paddingTop: "4rem",
      paddingBottom: "2rem",
    },
    title: {
      fontSize: windowSize.width < 768 ? "2rem" : "2.5rem",
      color: "#2c3e50",
      marginBottom: "1rem",
      textAlign: "center" as const,
      textShadow: "2px 2px 4px rgba(0,0,0,0.1)",
    },
    roomCodeContainer: {
      backgroundColor: "#fff",
      padding: "1rem",
      borderRadius: 12,
      marginBottom: "1.5rem",
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
      textAlign: "center" as const,
    },
    roomCodeText: {
      fontSize: windowSize.width < 768 ? "1rem" : "1.2rem",
      color: "#666",
      margin: 0,
    },
    roomCode: {
      color: "#3498db",
      fontWeight: 500,
      letterSpacing: "1px",
    },
    gameContainer: {
      backgroundColor: "#fff",
      padding: windowSize.width < 768 ? "1rem" : "2rem",
      borderRadius: 12,
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
      marginBottom: "1.5rem",
    },
    currentPlayerTitle: {
      fontSize: windowSize.width < 768 ? "1.4rem" : "1.8rem",
      color: "#2c3e50",
      marginBottom: "1rem",
      textAlign: "center" as const,
    },
    playerHighlight: {
      color: "#3498db",
      fontWeight: "bold",
    },
    typeSelectionContainer: {
      marginTop: "1.5rem",
      padding: windowSize.width < 768 ? "1rem" : "2rem",
      backgroundColor: "#f8f9fa",
      borderRadius: 12,
    },
    challengeTitle: {
      fontSize: windowSize.width < 768 ? "1.2rem" : "1.4rem",
      color: "#34495e",
      marginBottom: "1.5rem",
      textAlign: "center" as const,
    },
    buttonsContainer: {
      display: "flex",
      flexDirection:
        windowSize.width < 768 ? ("column" as const) : ("row" as const),
      justifyContent: "center",
      gap: windowSize.width < 768 ? "1rem" : "2rem",
      padding: "0 1rem",
    },
    truthButton: {
      padding: windowSize.width < 768 ? "1rem 2rem" : "1.5rem 3rem",
      fontSize: windowSize.width < 768 ? "1.1rem" : "1.3rem",
      backgroundColor: "#3498db",
      color: "white",
      border: "none",
      borderRadius: 12,
      cursor: "pointer",
      transition: "all 0.3s ease",
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      width: windowSize.width < 768 ? "100%" : "auto",
    },
    dareButton: {
      padding: windowSize.width < 768 ? "1rem 2rem" : "1.5rem 3rem",
      fontSize: windowSize.width < 768 ? "1.1rem" : "1.3rem",
      backgroundColor: "#e74c3c",
      color: "white",
      border: "none",
      borderRadius: 12,
      cursor: "pointer",
      transition: "all 0.3s ease",
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      width: windowSize.width < 768 ? "100%" : "auto",
    },
    buttonEmoji: {
      fontSize: windowSize.width < 768 ? "1.3rem" : "1.5rem",
    },
    promptContainer: {
      marginTop: "1.5rem",
      padding: windowSize.width < 768 ? "1rem" : "2rem",
      borderRadius: 12,
      borderWidth: 2,
      borderStyle: "solid",
    },
    promptHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1rem",
    },
    promptTitle: {
      fontSize: windowSize.width < 768 ? "1.2rem" : "1.4rem",
      marginBottom: "1rem",
    },
    promptContent: {
      padding: windowSize.width < 768 ? "0.8rem" : "1rem",
      backgroundColor: "rgba(255,255,255,0.5)",
      borderRadius: 8,
    },
    promptText: {
      fontSize: windowSize.width < 768 ? "1.2rem" : "1.4rem",
      margin: "1rem 0",
      color: "#2c3e50",
      lineHeight: 1.6,
      textAlign: "center" as const,
    },
    responseContainer: {
      marginTop: "1.5rem",
      textAlign: "center" as const,
      padding: "0 1rem",
    },
    responseInput: {
      width: "100%",
      maxWidth: 600,
      minHeight: 100,
      padding: "0.8rem",
      marginBottom: "1rem",
      borderRadius: 8,
      border: "2px solid #ddd",
      fontSize: windowSize.width < 768 ? "1rem" : "1.1rem",
      resize: "vertical" as const,
    },
    submitButton: {
      padding: windowSize.width < 768 ? "0.8rem 1.5rem" : "1rem 2rem",
      fontSize: windowSize.width < 768 ? "1rem" : "1.1rem",
      backgroundColor: "#2196F3",
      color: "white",
      border: "none",
      borderRadius: 8,
      cursor: "pointer",
      transition: "all 0.3s ease",
      width: windowSize.width < 768 ? "100%" : "auto",
    },
    responsesContainer: {
      backgroundColor: "#fff",
      padding: windowSize.width < 768 ? "1rem" : "2rem",
      borderRadius: 12,
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
      marginBottom: "1.5rem",
    },
    sectionTitle: {
      fontSize: windowSize.width < 768 ? "1.4rem" : "1.8rem",
      color: "#2c3e50",
      marginBottom: "1.5rem",
      textAlign: "center" as const,
    },
    responsesList: {
      maxHeight: 400,
      overflowY: "auto" as const,
      margin: "1rem auto",
      padding: "0.5rem",
    },
    responseItem: {
      margin: "0.8rem 0",
      padding: windowSize.width < 768 ? "1rem" : "1.5rem",
      backgroundColor: "#f8f9fa",
      borderRadius: 8,
      textAlign: "left" as const,
      borderLeftWidth: 4,
      borderLeftStyle: "solid" as const,
      position: "relative" as const,
    },
    responseHeader: {
      margin: "0.5rem 0",
      fontWeight: "bold" as const,
      color: "#2c3e50",
      fontSize: windowSize.width < 768 ? "0.9rem" : "1.1rem",
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap" as const,
      gap: "0.5rem",
    },
    responsePlayer: {
      marginRight: 4,
    },
    reactionBubble: {
      backgroundColor: "#fff",
      borderRadius: "50%",
      width: 24,
      height: 24,
      display: "inline-flex",
      justifyContent: "center",
      alignItems: "center",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    },
    responsePrompt: {
      margin: "0.8rem 0",
      color: "#34495e",
      fontSize: windowSize.width < 768 ? "0.9rem" : "1rem",
    },
    responseText: {
      margin: "0.8rem 0",
      color: "#34495e",
      fontSize: windowSize.width < 768 ? "0.9rem" : "1rem",
    },
    responseFooter: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap" as const,
      gap: "0.5rem",
    },
    responseTime: {
      color: "#7f8c8d",
      fontSize: windowSize.width < 768 ? "0.8rem" : "0.9rem",
    },
    reactionContainer: {
      display: "flex",
      gap: 4,
    },
    reactionButton: {
      background: "none",
      border: "none",
      fontSize: windowSize.width < 768 ? "1rem" : "1.2rem",
      cursor: "pointer",
      padding: "0.2rem",
      borderRadius: 4,
      transition: "transform 0.2s",
    },
    playersContainer: {
      backgroundColor: "#fff",
      padding: windowSize.width < 768 ? "1rem" : "2rem",
      borderRadius: 12,
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
    },
    playersList: {
      display: "flex",
      flexWrap: "wrap" as const,
      gap: "0.8rem",
      justifyContent: "center",
    },
    playerBadge: {
      padding: windowSize.width < 768 ? "0.6rem 1rem" : "0.8rem 1.5rem",
      borderRadius: 8,
      transition: "all 0.3s ease",
      fontSize: windowSize.width < 768 ? "0.9rem" : "1rem",
    },
  };

  return (
    <div style={styles.container}>
      {showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={500}
        />
      )}

      {/* Player Info Header */}
      <div style={styles.playerHeader}>
        <p style={styles.playerText}>
          Playing as: <span style={styles.playerName}>{myNickname}</span>
        </p>
      </div>

      <div style={styles.mainContent}>
        <h2 style={styles.title}>Truth or Dare</h2>

        <div style={styles.roomCodeContainer}>
          <p style={styles.roomCodeText}>
            Room Code: <span style={styles.roomCode}>{roomCode}</span>
          </p>
        </div>

        <div style={styles.gameContainer}>
          <h3 style={styles.currentPlayerTitle}>
            Current Player:{" "}
            <span style={styles.playerHighlight}>
              {currentPlayer?.nickname}
            </span>
          </h3>

          {isCurrentPlayer && showTypeSelection && (
            <div style={styles.typeSelectionContainer}>
              <h4 style={styles.challengeTitle}>Choose Your Challenge:</h4>
              <div style={styles.buttonsContainer}>
                <button
                  onClick={() => handleTypeSelection("truth")}
                  style={styles.truthButton}
                >
                  <span style={styles.buttonEmoji}>💬</span> Truth
                </button>
                <button
                  onClick={() => handleTypeSelection("dare")}
                  style={styles.dareButton}
                >
                  <span style={styles.buttonEmoji}>🔥</span> Dare
                </button>
              </div>
            </div>
          )}

          {currentPrompt && !showTypeSelection && (
            <div
              style={{
                ...styles.promptContainer,
                backgroundColor:
                  selectedType === "truth" ? "#e3f2fd" : "#ffebee",
                borderColor: selectedType === "truth" ? "#3498db" : "#e74c3c",
              }}
            >
              <div style={styles.promptHeader}>
                <h4
                  style={{
                    ...styles.promptTitle,
                    color: selectedType === "truth" ? "#1976d2" : "#c62828",
                  }}
                >
                  Your {currentPrompt.type}:
                </h4>
              </div>

              <div style={styles.promptContent}>
                <p style={styles.promptText}>{currentPrompt.content}</p>
              </div>

              {isCurrentPlayer && !hasResponded && (
                <div style={styles.responseContainer}>
                  <textarea
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder="Type your response here..."
                    style={styles.responseInput}
                    autoFocus
                  />
                  <button
                    onClick={handleSubmitResponse}
                    disabled={!response.trim()}
                    style={{
                      ...styles.submitButton,
                      opacity: response.trim() ? 1 : 0.7,
                      cursor: response.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    Submit Response
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={styles.responsesContainer}>
          <h3 style={styles.sectionTitle}>Recent Responses</h3>
          <div style={styles.responsesList}>
            {responses.map((r) => (
              <div
                key={r.id}
                style={{
                  ...styles.responseItem,
                  borderLeftColor:
                    r.prompts.type === "truth" ? "#3498db" : "#e74c3c",
                }}
              >
                <p style={styles.responseHeader}>
                  <span style={styles.responsePlayer}>
                    {r.players.nickname}
                  </span>{" "}
                  -
                  <span
                    style={{
                      color: r.prompts.type === "truth" ? "#3498db" : "#e74c3c",
                      fontWeight: "bold",
                      marginLeft: 4,
                    }}
                  >
                    {r.prompts.type}
                  </span>
                  {reactions[r.id] && (
                    <span style={styles.reactionBubble}>{reactions[r.id]}</span>
                  )}
                </p>
                <p style={styles.responsePrompt}>
                  <strong>Prompt:</strong> {r.prompts.content}
                </p>
                <p style={styles.responseText}>
                  <strong>Response:</strong> {r.response}
                </p>
                <div style={styles.responseFooter}>
                  <small style={styles.responseTime}>
                    {new Date(r.created_at).toLocaleTimeString()}
                  </small>
                  <div style={styles.reactionContainer}>
                    {["😂", "😲", "👏", "❤️"].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => addReaction(r.id, emoji)}
                        style={styles.reactionButton}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.playersContainer}>
          <h3 style={styles.sectionTitle}>Players</h3>
          <div style={styles.playersList}>
            {players.map((player) => (
              <div
                key={player.id}
                style={{
                  ...styles.playerBadge,
                  backgroundColor:
                    player.id === gameState?.current_player_id
                      ? "#e3f2fd"
                      : "#f8f9fa",
                  fontWeight:
                    player.id === gameState?.current_player_id
                      ? "bold"
                      : "normal",
                  color:
                    player.id === gameState?.current_player_id
                      ? "#1976d2"
                      : "#2c3e50",
                  border:
                    player.id === gameState?.current_player_id
                      ? "2px solid #1976d2"
                      : "none",
                  animation:
                    player.id === gameState?.current_player_id
                      ? "pulse 2s infinite"
                      : "none",
                }}
              >
                {player.nickname}
                {player.is_host && " 👑"}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GamePage;
