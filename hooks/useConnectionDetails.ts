import { useCallback, useEffect, useState } from 'react';
import { decodeJwt } from 'jose';

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;

export default function useConnectionDetails() {
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);

const fetchConnectionDetails = useCallback(async () => {
  // 1) Essayer d’hydrater depuis l’URL
  if (typeof window !== "undefined") {
    const hash = window.location.hash;
    const m = hash.match(/#\/room\/([^?]+)\?token=([^&]+)/);
    if (m) {
      const roomFromUrl = decodeURIComponent(m[1]);
      const tokenFromUrl = m[2];
      localStorage.setItem("livekitRoom", roomFromUrl);
      localStorage.setItem("livekitToken", tokenFromUrl);

      if (!localStorage.getItem("livekitName")) {
        localStorage.setItem("livekitName", "user");
      }
      if (!localStorage.getItem("livekitServer")) {
        localStorage.setItem(
          "livekitServer",
          process.env.NEXT_PUBLIC_LIVEKIT_URL || ""
        );
      }
    }
  }

  // 2) Charger depuis localStorage
  const serverUrl =
    localStorage.getItem("livekitServer") ||
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    "";
  const roomName = localStorage.getItem("livekitRoom");
  const participantToken = localStorage.getItem("livekitToken");
  const participantName = localStorage.getItem("livekitName") || "user";

  if (!serverUrl || !roomName || !participantToken) {
    throw new Error("Missing LiveKit connection details in localStorage");
  }

  const data: ConnectionDetails = {
    serverUrl,
    roomName,
    participantName,
    participantToken,
  };

  setConnectionDetails(data);
  return data;
}, []);


  useEffect(() => {
    fetchConnectionDetails();
  }, [fetchConnectionDetails]);

  const isConnectionDetailsExpired = useCallback(() => {
    const token = connectionDetails?.participantToken;
    if (!token) return true;

    const jwtPayload = decodeJwt(token);
    if (!jwtPayload.exp) return true;

    const expiresAt = new Date(jwtPayload.exp * 1000 - ONE_MINUTE_IN_MILLISECONDS);
    return new Date() >= expiresAt;
  }, [connectionDetails?.participantToken]);

  const existingOrRefreshConnectionDetails = useCallback(async () => {
    if (isConnectionDetailsExpired() || !connectionDetails) {
      return fetchConnectionDetails();
    } else {
      return connectionDetails;
    }
  }, [connectionDetails, fetchConnectionDetails, isConnectionDetailsExpired]);

  return {
    connectionDetails,
    refreshConnectionDetails: fetchConnectionDetails,
    existingOrRefreshConnectionDetails,
  };
}
