import React from "react";
import { useNavigate } from "react-router-dom";

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div style={{ textAlign: "center", marginTop: "3rem" }}>
      <h1>Truth or Dare 🎮</h1>
      <p>Play a fun multiplayer game with friends!</p>
      <button onClick={() => navigate("/create")}>Create Room</button>
      <button onClick={() => navigate("/join")} style={{ marginLeft: "1rem" }}>
        Join Room
      </button>
    </div>
  );
};

export default LandingPage;
