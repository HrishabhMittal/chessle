import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// Initialize WebSockets
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    (req as any).user = user;
    next();
};

// --- WEBSOCKET GAMEPLAY HANDLERS (No DB Polling!) ---
io.on('connection', (socket) => {
    socket.on('join_game', (gameId) => {
        socket.join(gameId);
    });

    socket.on('make_move', (data) => {
        // Instantly broadcast the move and clock times to the opponent
        socket.to(data.gameId).emit('receive_move', data);
    });
});

// --- REST API ROUTES ---
app.get('/api/profiles/search/:query', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('profiles').select('id,username,rating').ilike('username', `%${req.params.query}%`).neq('id', (req as any).user.id).limit(8);
    res.json({ data, error });
});

app.get('/api/profiles/:username', async (req, res) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('username', req.params.username).maybeSingle();
    res.json({ data, error });
});

app.get('/api/users/:id/profile', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', req.params.id).maybeSingle();
    res.json({ data, error });
});

app.get('/api/games/user/:userId', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('games').select('id,white_player_id,black_player_id,result,result_reason,time_control_minutes,time_control_increment,status,created_at').or(`white_player_id.eq.${req.params.userId},black_player_id.eq.${req.params.userId}`).eq('status', 'completed').order('created_at', { ascending: false }).limit(20);
    res.json({ data, error });
});

app.get('/api/games/:id', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('games').select('*').eq('id', req.params.id).maybeSingle();
    res.json({ data, error });
});

app.post('/api/games', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('games').insert({ ...req.body, started_at: new Date().toISOString() }).select().maybeSingle();
    res.json({ data, error });
});

// Background Syncing
app.post('/api/games/moves', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('game_moves').insert(req.body);
    res.json({ data, error });
});

app.put('/api/games/:id', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('games').update(req.body).eq('id', req.params.id).select();
    res.json({ data, error });
});

// --- MATCHMAKING ENGINE ---
interface QueueTicket { id: string; userId: string; rating: number; timeMin: number; timeInc: number; joinedAt: number; matchedGameId: string | null; }
let queue: QueueTicket[] = [];
let isMatchingLoopRunning = false;

app.post('/api/matchmaking/join', authenticate, (req, res) => {
    const { timeMin, timeInc, rating } = req.body;
    const userId = (req as any).user.id;
    queue = queue.filter(t => t.userId !== userId);
    const ticket: QueueTicket = { id: uuidv4(), userId, rating, timeMin, timeInc, joinedAt: Date.now(), matchedGameId: null };
    queue.push(ticket);
    res.json({ ticketId: ticket.id });
});

app.get('/api/matchmaking/status/:ticketId', authenticate, (req, res) => {
    const ticket = queue.find(t => t.id === req.params.ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ matchedGameId: ticket.matchedGameId });
});

app.post('/api/matchmaking/cancel', authenticate, (req, res) => {
    const userId = (req as any).user.id;
    queue = queue.filter(t => t.userId !== userId);
    res.json({ success: true });
});

setInterval(async () => {
    if (isMatchingLoopRunning) return;
    isMatchingLoopRunning = true;

    try {
        const searching = queue.filter(t => t.matchedGameId === null);
        const matchedPairs = new Set<string>();

        for (let i = 0; i < searching.length; i++) {
            const p1 = searching[i];
            if (!p1 || matchedPairs.has(p1.id)) continue;

            const p1TimeInQueue = Date.now() - p1.joinedAt;
            let bestMatch: QueueTicket | null = null;
            let minDiff = Infinity;

            for (let j = i + 1; j < searching.length; j++) {
                const p2 = searching[j];
                if (!p2 || matchedPairs.has(p2.id)) continue;
                if (p1.timeMin !== p2.timeMin || p1.timeInc !== p2.timeInc) continue;

                const diff = Math.abs(p1.rating - p2.rating);
                const p2TimeInQueue = Date.now() - p2.joinedAt;

                if ((p1TimeInQueue < 5000 || p2TimeInQueue < 5000) && diff > 100) continue;

                if (diff < minDiff) { bestMatch = p2; minDiff = diff; }
            }

            if (bestMatch) {
                matchedPairs.add(p1.id);
                matchedPairs.add(bestMatch.id);

                const color = Math.random() < 0.5 ? 'white' : 'black';
                const whiteId = color === 'white' ? p1.userId : bestMatch.userId;
                const blackId = color === 'black' ? p1.userId : bestMatch.userId;
                const timeMs = p1.timeMin * 60 * 1000;

                const { data: newGame, error } = await supabase.from('games').insert({
                    white_player_id: whiteId, black_player_id: blackId, time_control_minutes: p1.timeMin, time_control_increment: p1.timeInc, white_time_ms: timeMs, black_time_ms: timeMs, status: 'active', started_at: new Date().toISOString()
                }).select().maybeSingle();

                if (newGame && !error) {
                    p1.matchedGameId = newGame.id;
                    bestMatch.matchedGameId = newGame.id;
                }
            }
        }
    } catch (error) {
        console.error('Matchmaking Engine Error:', error);
    } finally {
        queue = queue.filter(t => (Date.now() - t.joinedAt) < 180000);
        isMatchingLoopRunning = false;
    }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Backend API running on port ${PORT}`));
