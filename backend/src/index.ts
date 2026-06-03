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

const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT'] }
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

const activeGameClocks = new Map();

io.on('connection', (socket) => {

    socket.on('join_user_room', (userId) => {
        socket.join(`user:${userId}`);
    });

    socket.on('send_challenge', (data) => {
        if (data.challenged_id) {
            io.to(`user:${data.challenged_id}`).emit('challenge_received', data);
        } else {
            socket.broadcast.emit('lobby_challenge_received', data);
        }
    });


    socket.on('join_game', (gameId) => {
        socket.join(gameId);
        if (!activeGameClocks.has(gameId)) {
            activeGameClocks.set(gameId, { lastMoveTimestamp: Date.now() });
        }
    });

    socket.on('make_move', async (data) => {
        const { gameId, move, history, isWhiteMove, timeControlIncrement, pgn, fen } = data;
        const now = Date.now();

        const clockData = activeGameClocks.get(gameId);
        const elapsed = now - (clockData?.lastMoveTimestamp || now);
        activeGameClocks.set(gameId, { lastMoveTimestamp: now });

        try {
            const { data: game, error } = await supabase.from('games').select('*').eq('id', gameId).single();

            if (game && !error) {
                let newWhiteTime = game.white_time_ms;
                let newBlackTime = game.black_time_ms;
                const incMs = (timeControlIncrement || 0) * 1000;

                if (isWhiteMove) newWhiteTime = Math.max(0, newWhiteTime - elapsed) + incMs;
                else newBlackTime = Math.max(0, newBlackTime - elapsed) + incMs;

                await supabase.from('games').update({
                    pgn: pgn, fen: fen, current_turn: isWhiteMove ? 'black' : 'white',
                    white_time_ms: newWhiteTime, black_time_ms: newBlackTime, move_count: history.length
                }).eq('id', gameId);

                socket.to(gameId).emit('receive_move', { move, history, whiteTimeMs: newWhiteTime, blackTimeMs: newBlackTime });
                io.in(gameId).emit('sync_clocks', { whiteTimeMs: newWhiteTime, blackTimeMs: newBlackTime });
            }
        } catch (error) {
            console.error("Error processing server-side move:", error);
        }
    });

    socket.on('send_message', (data) => { socket.to(data.gameId).emit('receive_message', data); });
    socket.on('offer_draw', (data) => { socket.to(data.gameId).emit('draw_offered', data); });
    socket.on('decline_draw', (data) => { socket.to(data.gameId).emit('draw_declined', data); });
    socket.on('game_over', (data) => {
        socket.to(data.gameId).emit('game_over_update', data);
        activeGameClocks.delete(data.gameId);
    });
});

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
async function processRatingChanges(gameId: string, whiteId: string, blackId: string, result: string) {
    console.log(`\n[RATING SYSTEM] Match ${gameId} ended.`);
    console.log(`[RATING SYSTEM] Result: ${result}. Calculating new Elo for White (${whiteId}) and Black (${blackId})...`);





    return true;
}
app.put('/api/games/:id', authenticate, async (req, res) => {
    const gameId = req.params.id as string;
    const { status, result } = req.body;


    if (status === 'completed' && result) {

        const { data: existingGame } = await supabase.from('games').select('*').eq('id', gameId).single();

        if (existingGame && existingGame.status !== 'completed' && existingGame.is_rated) {

            await processRatingChanges(gameId, existingGame.white_player_id, existingGame.black_player_id, result);
        }
    }


    const { data, error } = await supabase.from('games').update(req.body).eq('id', gameId).select();
    res.json({ data, error });
});

app.post('/api/challenges', authenticate, async (req, res) => {
    const { data, error } = await supabase.from('challenges').insert({ ...req.body, created_at: new Date().toISOString() }).select().maybeSingle();
    res.json({ data, error });
});

app.get('/api/challenges/pending', authenticate, async (req, res) => {
    const userId = (req as any).user.id;
    const { data, error } = await supabase.from('challenges').select('*').eq('challenged_id', userId).eq('status', 'pending');
    res.json({ data, error });
});

app.get('/api/challenges/lobby', authenticate, async (req, res) => {
    const userId = (req as any).user.id;
    const { data: userProfile } = await supabase.from('profiles').select('rating').eq('id', userId).single();
    const userRating = userProfile?.rating || 1200;

    const { data: challenges, error } = await supabase
        .from('challenges')
        .select('*')
        .is('challenged_id', null)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) return res.status(500).json({ error: error.message });

    const challengerIds = [...new Set((challenges || []).map(c => c.challenger_id))];
    const profilesMap: Record<string, any> = {};

    if (challengerIds.length > 0) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, rating')
            .in('id', challengerIds);

        if (profiles) {
            profiles.forEach(p => profilesMap[p.id] = p);
        }
    }
    const filtered = (challenges || []).filter((c: any) => {
        if (c.challenger_id === userId) return false;
        const challengerProfile = profilesMap[c.challenger_id];
        if (!challengerProfile) return true;
        return Math.abs(challengerProfile.rating - userRating) <= 400;
    }).map((c: any) => ({
        ...c,
        challenger: profilesMap[c.challenger_id] || { username: 'Unknown', rating: 1200 }
    })).slice(0, 20);
    res.json({ data: filtered });
});


app.put('/api/challenges/:id/respond', authenticate, async (req, res) => {
    const { status } = req.body;
    const challengeId = req.params.id;

    const { data: challenge } = await supabase
        .from('challenges').select('*').eq('id', challengeId).maybeSingle();

    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    await supabase.from('challenges').update({ status }).eq('id', challengeId);

    if (status === 'accepted') {
        const timeMs = challenge.time_control_minutes * 60 * 1000;

        const { data: newGame } = await supabase.from('games').insert({
            white_player_id: challenge.challenger_id,
            black_player_id: challenge.challenged_id,
            time_control_minutes: challenge.time_control_minutes,
            time_control_increment: challenge.time_control_increment,
            white_time_ms: timeMs, black_time_ms: timeMs,
            status: 'active',
            is_rated: challenge.is_rated ?? true,
            started_at: new Date().toISOString()
        }).select().maybeSingle();

        io.to(`user:${challenge.challenger_id}`).emit('challenge_accepted', { gameId: newGame.id });
        io.to(`user:${challenge.challenged_id}`).emit('challenge_accepted', { gameId: newGame.id });

        return res.json({ data: newGame });
    }

    res.json({ success: true });
});


app.post('/api/challenges/:id/accept_lobby', authenticate, async (req, res) => {
    const userId = (req as any).user.id;
    const challengeId = req.params.id;

    const { data: challenge, error } = await supabase.from('challenges').select('*').eq('id', challengeId).single();
    if (error || !challenge || challenge.status !== 'open') return res.status(400).json({ error: 'Challenge no longer available' });
    if (challenge.challenger_id === userId) return res.status(400).json({ error: 'Cannot accept own challenge' });

    await supabase.from('challenges').update({ status: 'accepted' }).eq('id', challengeId);

    const color = challenge.challenger_color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : challenge.challenger_color;
    const whiteId = color === 'white' ? challenge.challenger_id : userId;
    const blackId = color === 'black' ? challenge.challenger_id : userId;
    const timeMs = challenge.time_control_minutes * 60 * 1000;

    const { data: newGame, error: gameError } = await supabase.from('games').insert({
        white_player_id: whiteId,
        black_player_id: blackId,
        time_control_minutes: challenge.time_control_minutes,
        time_control_increment: challenge.time_control_increment,
        white_time_ms: timeMs,
        black_time_ms: timeMs,
        status: 'active',
        is_rated: challenge.is_rated ?? true,
        started_at: new Date().toISOString()
    }).select().single();

    if (gameError) return res.status(500).json({ error: gameError.message });

    await supabase.from('challenges').update({ matched_game_id: newGame.id }).eq('id', challengeId);


    io.to(`user:${challenge.challenger_id}`).emit('challenge_accepted', { gameId: newGame.id });

    res.json({ data: newGame });
});

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
                    white_player_id: whiteId, black_player_id: blackId, time_control_minutes: p1.timeMin,
                    time_control_increment: p1.timeInc, white_time_ms: timeMs, black_time_ms: timeMs,
                    status: 'active', is_rated: true, started_at: new Date().toISOString()
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
