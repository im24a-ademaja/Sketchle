import { io } from 'socket.io-client';
import { API_URL } from '../api/client';

const socket = io(import.meta.env.VITE_SOCKET_URL || API_URL, { autoConnect: false });

export default socket;