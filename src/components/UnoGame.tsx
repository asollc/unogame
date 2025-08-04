import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ArrowRight, Trophy, History, Copy, Check, ZoomIn, ZoomOut, Clock } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Types
type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
type CardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
type GameState = 'lobby' | 'waiting' | 'seating' | 'playing' | 'ended' | 'color-select' | 'joining';
interface UnoCard {
  id: string;
  color: CardColor;
  type: CardType;
  value?: number;
}
interface Player {
  id: string;
  name: string;
  hand: UnoCard[];
  position: number;
  isHost: boolean;
  seated: boolean;
  seatedPosition?: number;
}
interface Game {
  id: string;
  hostId: string;
  inviteCode: string;
  maxPlayers: number;
  currentPlayerIndex: number;
  direction: 1 | -1;
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  currentColor: CardColor;
  drawCount: number;
  pendingWildCard?: UnoCard;
  lastPlayedCard?: UnoCard;
  playHistory: {
    player: string;
    action: string;
  }[];
  gameState: string;
  winnerId?: string;
  players: Player[];
  selectedCards: UnoCard[];
  stackingTimer?: string;
  pendingDrawTotal: number;
  pendingDrawType?: string;
  stackedDiscard: UnoCard[];
  expandedHandPlayer?: string;
  scoringEnabled: boolean;
  scoreLimit?: number;
  matchScores: number[][];
  playerTotalScores: Record<string, number>;
  eliminatedPlayers: string[];
  currentMatchNumber: number;
  finalWinnerId?: string;
}

// Card generation
const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
function generateDeck(): UnoCard[] {
  const deck: UnoCard[] = [];

  // Generate 2 complete decks
  for (let deckNum = 0; deckNum < 2; deckNum++) {
    colors.forEach(color => {
      deck.push({
        id: `${color}-0-deck${deckNum}`,
        color,
        type: 'number',
        value: 0
      });
      numbers.slice(1).forEach(num => {
        deck.push({
          id: `${color}-${num}-deck${deckNum}`,
          color,
          type: 'number',
          value: num
        });
        deck.push({
          id: `${color}-${num}-2-deck${deckNum}`,
          color,
          type: 'number',
          value: num
        });
      });
    });
    colors.forEach(color => {
      ['skip', 'reverse', 'draw2'].forEach(type => {
        deck.push({
          id: `${color}-${type}-deck${deckNum}`,
          color,
          type: type as CardType
        });
        deck.push({
          id: `${color}-${type}-2-deck${deckNum}`,
          color,
          type: type as CardType
        });
      });
    });
    for (let i = 0; i < 4; i++) {
      deck.push({
        id: `wild-${i}-deck${deckNum}`,
        color: 'wild',
        type: 'wild'
      });
      deck.push({
        id: `wild4-${i}-deck${deckNum}`,
        color: 'wild',
        type: 'wild4'
      });
    }
  }
  return deck;
}
function shuffleDeck(deck: UnoCard[]): UnoCard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Data validation helpers
function isValidUnoCard(obj: any): obj is UnoCard {
  return obj && typeof obj === 'object' && typeof obj.id === 'string' && typeof obj.color === 'string' && typeof obj.type === 'string';
}
function validateUnoCards(data: any): UnoCard[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isValidUnoCard);
}
function validateUnoCard(data: any): UnoCard | null {
  return isValidUnoCard(data) ? data : null;
}
function validateMatchScores(data: any): number[][] {
  if (!Array.isArray(data)) return [];
  return data.filter(row => Array.isArray(row) && row.every(score => typeof score === 'number'));
}
function validatePlayerTotalScores(data: any): Record<string, number> {
  if (!data || typeof data !== 'object') return {};
  const result: Record<string, number> = {};
  Object.keys(data).forEach(key => {
    if (typeof data[key] === 'number') {
      result[key] = data[key];
    }
  });
  return result;
}
function validateEliminatedPlayers(data: any): string[] {
  if (!Array.isArray(data)) return [];
  return data.filter(id => typeof id === 'string');
}
function getColorClasses(color: CardColor): string {
  const baseClasses = "border-2";
  switch (color) {
    case 'red':
      return `${baseClasses} bg-red-500 text-white border-red-700`;
    case 'blue':
      return `${baseClasses} bg-blue-500 text-white border-blue-700`;
    case 'green':
      return `${baseClasses} bg-green-500 text-white border-green-700`;
    case 'yellow':
      return `${baseClasses} bg-yellow-400 text-black border-yellow-600`;
    case 'wild':
      return `${baseClasses} bg-gradient-to-br from-purple-600 to-pink-600 text-white border-purple-700`;
    default:
      return baseClasses;
  }
}

// Confetti component
function Confetti() {
  return <div className="fixed inset-0 pointer-events-none z-50">
      {[...Array(50)].map((_, i) => <div key={i} className="absolute w-2 h-2 bg-gradient-to-br from-yellow-400 via-red-500 to-blue-500 rounded-full animate-bounce" style={{
      left: `${Math.random() * 100}%`,
      top: `-10px`,
      animationDelay: `${Math.random() * 2}s`,
      animationDuration: `${2 + Math.random() * 2}s`
    }} />)}
    </div>;
}

// Color Selection Modal
function ColorSelectModal({
  onColorSelect,
  onClose
}: {
  onColorSelect: (color: CardColor) => void;
  onClose: () => void;
}) {
  return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        <h3 className="text-xl font-bold text-white text-center">Choose a Color</h3>
        <div className="grid grid-cols-2 gap-4">
          {colors.map(color => <button key={color} onClick={() => onColorSelect(color)} className={`w-16 h-16 rounded-lg ${getColorClasses(color)} hover:scale-110 transition-transform`}>
              <span className="text-white font-bold text-sm" style={{
            textShadow: '1px 1px 0 black'
          }}>
                {color.toUpperCase()}
              </span>
            </button>)}
        </div>
        <Button onClick={onClose} variant="outline" className="w-full">
          Cancel
        </Button>
      </div>
    </div>;
}
export default function UnoGame() {
  console.log('UnoGame component rendering...');
  const [gameState, setGameState] = useState<GameState>('lobby');
  const [game, setGame] = useState<Game | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [selectedColor, setSelectedColor] = useState<CardColor | null>(null);
  const [playerId] = useState(() => Math.random().toString(36).substring(7));
  const [showHistory, setShowHistory] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedCards, setSelectedCards] = useState<UnoCard[]>([]);
  const [showColorSelect, setShowColorSelect] = useState(false);
  const [pendingWildCards, setPendingWildCards] = useState<UnoCard[]>([]);
  const [expandedHand, setExpandedHand] = useState(false);
  const [selectedPlayerForSeating, setSelectedPlayerForSeating] = useState<string | null>(null);
  const [drawTimer, setDrawTimer] = useState<number | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);
  const [joinGameCode, setJoinGameCode] = useState('');
  const [scoringEnabled, setScoringEnabled] = useState(false);
  const [scoreLimit, setScoreLimit] = useState(300);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const {
    toast
  } = useToast();

  // CRITICAL: Use useMemo for topCard so validation functions always have current value
  // Must be declared with all other hooks at the top of the component
  const topCard = React.useMemo(() => {
    if (!game?.discardPile?.length) return null;
    return game.discardPile[game.discardPile.length - 1];
  }, [game?.discardPile]);

  // Prevent page refresh via scroll
  useEffect(() => {
    let refreshWarned = false;
    const preventRefresh = (e: BeforeUnloadEvent) => {
      if (!refreshWarned) {
        refreshWarned = true;
        e.preventDefault();
        e.returnValue = 'You will exit the game if you refresh. Are you sure?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', preventRefresh);
    return () => window.removeEventListener('beforeunload', preventRefresh);
  }, []);

  // Timer effect for draw card response
  useEffect(() => {
    if (drawTimer && drawTimer > 0) {
      const interval = setInterval(() => {
        setDrawTimer(prev => {
          if (prev && prev <= 1) {
            setTimerExpired(true);
            handleDrawTimeout();
            return null;
          }
          return prev ? prev - 1 : null;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [drawTimer]);

  // Check for invite code in URL and scroll to top
  useEffect(() => {
    // Always scroll to top when component loads
    window.scrollTo(0, 0);
    const urlParams = new URLSearchParams(window.location.search);
    const gameCode = urlParams.get('game');
    if (gameCode) {
      setInviteCode(gameCode);
      setGameState('joining');
    }
  }, []);

  // Real-time subscription with reconnection handling
  useEffect(() => {
    if (!game?.id) return;
    const channel = supabase.channel(`game-${game.id}`).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'games',
      filter: `id=eq.${game.id}`
    }, payload => {
      console.log('Game change detected:', payload);
      
      // Check for player join notifications in the play history
      if (payload.new && (payload.new as any).play_history && payload.old && (payload.old as any).play_history) {
        const newHistory = (payload.new as any).play_history;
        const oldHistory = (payload.old as any).play_history;
        
        // Find new entries in the history
        if (Array.isArray(newHistory) && Array.isArray(oldHistory) && newHistory.length > oldHistory.length) {
          const newEntries = newHistory.slice(oldHistory.length);
          newEntries.forEach((entry: any) => {
            if (entry.action === 'joined the game') {
              // Show notification for all players except the one who joined
              const myPlayer = game?.players.find(p => p.id === playerId);
              if (myPlayer && entry.player !== myPlayer.name) {
                toast({
                  title: "Player joined!",
                  description: myPlayer.isHost ? 
                    `${entry.player} joined the game` : 
                    `${entry.player} joined the game. Please wait while the host sets up the match.`
                });
              }
            }
          });
        }
      }
      
      loadGame(game.id);
    }).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'players',
      filter: `game_id=eq.${game.id}`
    }, payload => {
      console.log('Player change detected:', payload);
      loadGame(game.id);
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [game?.id]);

  // Auto-reload game on page visibility change (handles reconnection)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && game?.id) {
        console.log('Page became visible, reloading game state...');
        loadGame(game.id);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [game?.id]);
  const loadGame = async (gameId: string) => {
    try {
      // Load game data
      const {
        data: gameData,
        error: gameError
      } = await supabase.from('games').select('*').eq('id', gameId).single();
      if (gameError) throw gameError;

      // Load players
      const {
        data: playersData,
        error: playersError
      } = await supabase.from('players').select('*').eq('game_id', gameId).order('position');
      if (playersError) throw playersError;

      // Transform to match our interface
      const transformedGame: Game = {
        id: gameData.id,
        hostId: gameData.host_id,
        inviteCode: gameData.invite_code,
        maxPlayers: gameData.max_players,
        currentPlayerIndex: gameData.current_player_index,
        direction: gameData.direction as 1 | -1,
        drawPile: validateUnoCards(gameData.draw_pile),
        discardPile: validateUnoCards(gameData.discard_pile),
        currentColor: gameData.current_color as CardColor,
        drawCount: gameData.draw_count,
        lastPlayedCard: validateUnoCard(gameData.last_played_card),
        playHistory: Array.isArray(gameData.play_history) ? gameData.play_history as {
          player: string;
          action: string;
        }[] : [],
        gameState: gameData.game_state,
        winnerId: gameData.winner_id,
        selectedCards: validateUnoCards(gameData.selected_cards),
        stackingTimer: gameData.stacking_timer,
        pendingDrawTotal: gameData.pending_draw_total || 0,
        pendingDrawType: gameData.pending_draw_type,
        stackedDiscard: validateUnoCards(gameData.stacked_discard),
        expandedHandPlayer: gameData.expanded_hand_player,
        scoringEnabled: gameData.scoring_enabled || false,
        scoreLimit: gameData.score_limit,
        matchScores: validateMatchScores(gameData.match_scores),
        playerTotalScores: validatePlayerTotalScores(gameData.player_total_scores),
        eliminatedPlayers: validateEliminatedPlayers(gameData.eliminated_players),
        currentMatchNumber: gameData.current_match_number || 1,
        finalWinnerId: gameData.final_winner_id,
        players: playersData.map(p => ({
          id: p.player_id,
          name: p.name,
          hand: validateUnoCards(p.hand),
          position: p.position,
          isHost: p.is_host,
          seated: p.seated || false,
          seatedPosition: p.seated_position
        }))
      };
      setGame(transformedGame);
      setGameState(transformedGame.gameState as GameState);

      // Handle timer for current player (who needs to respond to draw)
      if (transformedGame.stackingTimer && transformedGame.pendingDrawTotal > 0) {
        // Use the fresh database state to determine who should see the timer
        const currentPlayerFromDB = transformedGame.players[transformedGame.currentPlayerIndex];
        if (currentPlayerFromDB?.id === playerId) {
          const timerEnd = new Date(transformedGame.stackingTimer).getTime();
          const now = Date.now();
          const remaining = Math.max(0, Math.ceil((timerEnd - now) / 1000));
          setDrawTimer(remaining);
        } else {
          setDrawTimer(null); // Clear timer if not our turn
        }
      } else {
        setDrawTimer(null);
      }
    } catch (error) {
      console.error('Error loading game:', error);
    }
  };

  // Card selection functions
  const selectCard = (card: UnoCard, cardIndex: number) => {
    if (!game || !myPlayer || gameState !== 'playing') return;

    // Check if it's the player's turn
    const currentPlayer = game.players[game.currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === myPlayer.id;
    
    console.log('🔍 selectCard validation:', {
      currentPlayerIndex: game.currentPlayerIndex,
      currentPlayerId: currentPlayer?.id,
      myPlayerId: myPlayer.id,
      isMyTurn,
      cardToPlay: `${card.color} ${card.value || card.type}`,
      canPlay: canPlayCard(card)
    });
    
    if (!isMyTurn) {
      console.log('❌ Not player turn - blocking card selection');
      toast({
        title: "Not your turn",
        description: "Wait for your turn to play",
        variant: "destructive"
      });
      return;
    }

    // Handle deselection first - check if card is already selected
    const isAlreadySelected = selectedCards.some(c => c.id === card.id);
    if (isAlreadySelected) {
      console.log('🔄 Deselecting card:', `${card.color} ${card.value || card.type}`);
      setSelectedCards(prev => prev.filter(c => c.id !== card.id));
      return;
    }

    // Check draw response mode first
    const inDrawResponseMode = game.pendingDrawTotal > 0 && game.pendingDrawType;
    if (inDrawResponseMode) {
      if (!canPlayDrawCard(card)) {
        console.log('❌ Invalid draw response card');
        toast({
          title: "Must play matching draw card",
          description: `You must play a ${game.pendingDrawType} card or draw +${game.pendingDrawTotal} cards`,
          variant: "destructive"
        });
        return;
      }
    }

    // CRITICAL: Single validation point - validate card can be played
    if (!canPlayCard(card)) {
      console.log('❌ Invalid card play attempt - blocking selection');
      
      // Provide specific error message based on game state
      let errorMessage = "";
      if (topCard?.type === 'number') {
        errorMessage = `Must match color (${game.currentColor}) or number (${topCard.value})`;
      } else if (topCard?.type && topCard.type !== 'wild' && topCard.type !== 'wild4') {
        errorMessage = `Must match card type (${topCard.type}) or color (${game.currentColor})`;
      } else {
        errorMessage = `Must match color (${game.currentColor})`;
      }
      
      toast({
        title: "Invalid card",
        description: errorMessage,
        variant: "destructive"
      });
      return;
    }
    
    console.log('✅ Card selection allowed - proceeding');

    // Handle card selection - either first card or stacking
    if (selectedCards.length === 0) {
      // First card selection - already validated above
      setSelectedCards([card]);
    } else {
      // Additional card - validate for stacking
      const firstCard = selectedCards[0];
      if (canStackCard(firstCard, card)) {
        setSelectedCards(prev => [...prev, card]);
      } else {
        const stackType = firstCard.type === 'number' ? `number ${firstCard.value}` : firstCard.type;
        toast({
          title: "Cannot stack",
          description: `Can only stack cards with same ${stackType}`,
          variant: "destructive"
        });
      }
    }
  };
  const canStackCard = (firstCard: UnoCard, newCard: UnoCard): boolean => {
    // For number cards, stack same numbers regardless of color
    if (firstCard.type === 'number' && newCard.type === 'number') {
      return firstCard.value === newCard.value;
    }

    // For special cards (draw2, skip, reverse, wild, wild4), stack same type regardless of color
    if (firstCard.type === newCard.type && firstCard.type !== 'number') {
      return true;
    }
    return false;
  };
  const canPlayCard = (card: UnoCard): boolean => {
    if (!topCard || !game) {
      console.log('❌ canPlayCard: Missing topCard or game', { topCard: !!topCard, game: !!game });
      return false;
    }

    console.log('🔍 canPlayCard validation:', {
      card: `${card.color} ${card.value || card.type}`,
      topCard: `${topCard.color} ${topCard.value || topCard.type}`, 
      currentColor: game.currentColor,
      pendingDrawTotal: game.pendingDrawTotal,
      selectedCardsCount: selectedCards.length
    });

    // In draw response mode, only matching draw cards allowed
    if (game.pendingDrawTotal > 0 && game.pendingDrawType) {
      const canPlayDraw = canPlayDrawCard(card);
      console.log(canPlayDraw ? '✅' : '❌', 'Draw response mode - can play:', canPlayDraw);
      return canPlayDraw;
    }

    // Wild cards can always be played (except during draw response)
    if (card.color === 'wild') {
      console.log('✅ Wild card - always playable');
      return true;
    }

    const currentColor = game.currentColor;

    // FIXED STACKING LOGIC: Only validate FIRST card against game state
    // Additional cards in stack only need to match the first card
    if (selectedCards.length === 0) {
      // First card - must match current game state
      // Match current color
      if (card.color === currentColor) {
        console.log('✅ Color match:', card.color, '===', currentColor);
        return true;
      }

      // Match number value
      if (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value) {
        console.log('✅ Number match:', card.value, '===', topCard.value);
        return true;
      }

      // Match special card type (skip, reverse, draw2) but not wild types
      if (card.type === topCard.type && card.type !== 'wild' && card.type !== 'wild4') {
        console.log('✅ Type match:', card.type, '===', topCard.type);
        return true;
      }
      
      console.log('❌ First card validation failed - no valid matches found');
      return false;
    } else {
      // Subsequent cards - only need to match the first selected card
      // This is handled in selectCard() via canStackCard()
      console.log('✅ Subsequent card - validation handled by canStackCard()');
      return true;
    }
  };
  const canPlayDrawCard = (card: UnoCard): boolean => {
    if (!game.pendingDrawType) return false;

    // Can only play matching draw card type
    if (game.pendingDrawType === 'draw2' && card.type === 'draw2') return true;
    if (game.pendingDrawType === 'wild4' && card.type === 'wild4') return true;
    return false;
  };
  const playSelectedCards = async () => {
    if (!game || !myPlayer || selectedCards.length === 0) return;

    // Check if cards contain wild cards and need color selection
    const hasWild = selectedCards.some(card => card.color === 'wild');
    if (hasWild && !selectedColor) {
      setPendingWildCards(selectedCards);
      setShowColorSelect(true);
      return;
    }
    await executeCardPlay(selectedCards, selectedColor || null);
  };
  const executeCardPlay = async (cards: UnoCard[], chosenColor: CardColor | null) => {
    if (!game || !myPlayer) return;
    try {
      // Calculate turn effects BEFORE making any changes
      const effects = calculateCardEffects(cards);
      
      console.log('🎯 executeCardPlay - starting:', {
        currentPlayerIndex: game.currentPlayerIndex,
        calculatedNextPlayerIndex: effects.nextPlayerIndex,
        direction: effects.newDirection,
        playedCards: cards.map(c => `${c.color} ${c.value || c.type}`)
      });
      
      // Remove cards from player's hand
      const newHand = [...myPlayer.hand];
      cards.forEach(card => {
        const index = newHand.findIndex(c => c.id === card.id);
        if (index !== -1) {
          newHand.splice(index, 1);
        }
      });

      // Update player's hand
      await supabase.from('players').update({
        hand: newHand as any
      }).eq('game_id', game.id).eq('player_id', playerId);

      // Handle draw card stacking
      let newPendingDrawTotal = game.pendingDrawTotal;
      let newPendingDrawType = game.pendingDrawType;
      let newStackingTimer = game.stackingTimer;
      
      if (cards.some(c => c.type === 'draw2' || c.type === 'wild4')) {
        const drawCards = cards.filter(c => c.type === 'draw2' || c.type === 'wild4');
        const drawAmount = drawCards.reduce((sum, card) => {
          return sum + (card.type === 'draw2' ? 2 : 4);
        }, 0);
        newPendingDrawTotal += drawAmount;
        newPendingDrawType = drawCards[0].type === 'draw2' ? 'draw2' : 'wild4';

        // Set 6-second timer for next player to respond
        newStackingTimer = new Date(Date.now() + 6000).toISOString();
      } else {
        // For all other cards, clear any pending draw state
        if (game.pendingDrawTotal > 0) {
          newPendingDrawTotal = 0;
          newPendingDrawType = null;
          newStackingTimer = null;
        }
      }

      // Determine new color
      let newColor = chosenColor || cards[cards.length - 1].color;
      if (newColor === 'wild') {
        newColor = game.currentColor; // Keep current color if no choice made
      }

      // Create stacked discard pile
      const newStackedDiscard = [...cards];
      const newDiscardPile = [...game.discardPile, ...cards];

      // Create play history entry
      // Create play history entry with proper wild card handling
      let actionText = '';
      if (cards.length === 1) {
        const card = cards[0];
        if (card.type === 'wild4') {
          actionText = `wild draw 4`;
        } else if (card.type === 'wild') {
          actionText = `wild-${chosenColor || game.currentColor}`;
        } else if (card.type === 'number') {
          actionText = `${card.color} ${card.value}`;
        } else {
          actionText = `${card.color} ${card.type}`;
        }
      } else {
        const card = cards[0];
        if (card.type === 'number') {
          actionText = `${cards.length} ${card.value}s`;
        } else {
          actionText = `${cards.length} ${card.type}s`;
        }
      }
      // Create play history entries including skip notifications
      const playHistoryEntries = [{
        player: myPlayer.name,
        action: actionText
      }];
      
      // Add skip notifications to history
      if (effects.skippedPlayers && effects.skippedPlayers.length > 0) {
        effects.skippedPlayers.forEach(playerName => {
          playHistoryEntries.push({
            player: playerName,
            action: "was skipped"
          });
        });
      }
      
      const newPlayHistory = [...game.playHistory, ...playHistoryEntries];

      // Update local game state immediately for draw cards to fix timer display
      const drawCards = cards.filter(c => c.type === 'draw2' || c.type === 'wild4');
      if (drawCards.length > 0) {
        setGame(prevGame => {
          if (!prevGame) return prevGame;
          return {
            ...prevGame,
            currentPlayerIndex: effects.nextPlayerIndex,
            pendingDrawTotal: newPendingDrawTotal,
            pendingDrawType: newPendingDrawType,
            stackingTimer: newStackingTimer,
            currentColor: newColor,
            direction: effects.newDirection as 1 | -1
          };
        });
      }

      // CRITICAL: Always update to calculated next player index
      const gameUpdate = {
        discard_pile: newDiscardPile as any,
        stacked_discard: newStackedDiscard as any,
        current_color: newColor,
        current_player_index: effects.nextPlayerIndex, // Use calculated next player
        direction: effects.newDirection,
        play_history: newPlayHistory as any,
        last_played_card: cards[cards.length - 1] as any,
        pending_draw_total: newPendingDrawTotal,
        pending_draw_type: newPendingDrawType,
        stacking_timer: newStackingTimer,
        selected_cards: [] as any,
        winner_id: newHand.length === 0 ? playerId : null,
        game_state: newHand.length === 0 ? 'ended' : 'playing'
      };

      console.log('🚀 Database update:', {
        oldCurrentPlayerIndex: game.currentPlayerIndex,
        newCurrentPlayerIndex: effects.nextPlayerIndex,
        direction: effects.newDirection,
        newCurrentColor: newColor
      });

      await supabase.from('games').update(gameUpdate).eq('id', game.id);

      // Update local state immediately to prevent UI lag
      setGame(prev => prev ? { 
        ...prev, 
        ...gameUpdate,
        direction: effects.newDirection as 1 | -1
      } : null);

      console.log('✅ Card play completed successfully');

      // Clear selections
      setSelectedCards([]);
      setSelectedColor(null);
      setPendingWildCards([]);
      setShowColorSelect(false);

      // Show win message
      if (newHand.length === 0) {
        toast({
          title: "Congratulations!",
          description: "You won the game!"
        });
      }
    } catch (error) {
      console.error('Error playing cards:', error);
      toast({
        title: "Error",
        description: "Failed to play cards",
        variant: "destructive"
      });
    }
  };
  // Helper function to get seated players in position order
  const getSeatedPlayers = () => {
    return game?.players.filter(p => p.seated).sort((a, b) => a.seatedPosition! - b.seatedPosition!) || [];
  };

  // Helper function to get current seated player index
  const getCurrentSeatedPlayerIndex = () => {
    if (!game) return 0;
    const seatedPlayers = getSeatedPlayers();
    const currentPlayer = game.players[game.currentPlayerIndex];
    return seatedPlayers.findIndex(p => p.id === currentPlayer?.id) || 0;
  };

  const calculateCardEffects = (cards: UnoCard[]) => {
    if (!game) return {
      nextPlayerIndex: 0,
      newDirection: 1,
      drawEffects: 0,
      skipEffects: 0,
      skippedPlayers: []
    };
    
    const seatedPlayers = getSeatedPlayers();
    if (seatedPlayers.length === 0) return {
      nextPlayerIndex: game.currentPlayerIndex,
      newDirection: game.direction,
      drawEffects: 0,
      skipEffects: 0,
      skippedPlayers: []
    };

    const currentSeatedIndex = getCurrentSeatedPlayerIndex();
    let nextSeatedIndex = currentSeatedIndex;
    let newDirection = game.direction;
    let skipCount = 0;
    const skippedPlayers: string[] = [];
    
    cards.forEach(card => {
      switch (card.type) {
        case 'reverse':
          newDirection *= -1;
          if (seatedPlayers.length === 2) {
            skipCount += 1; // In 2-player games, reverse acts as skip
          }
          break;
        case 'skip':
          skipCount += 1;
          break;
        // Remove auto-skip for draw cards - they only skip when stacked
        case 'draw2':
        case 'wild4':
          // Don't auto-skip - next player has choice to draw or play matching card
          break;
      }
    });

    // FIXED: Proper skip logic with player tracking
    // Always advance turn first (current player's turn always ends)
    nextSeatedIndex = (nextSeatedIndex + newDirection + seatedPlayers.length) % seatedPlayers.length;
    
    // Then skip additional players based on skip count
    for (let i = 0; i < skipCount; i++) {
      const skippedPlayer = seatedPlayers[nextSeatedIndex];
      if (skippedPlayer) {
        skippedPlayers.push(skippedPlayer.name);
      }
      nextSeatedIndex = (nextSeatedIndex + newDirection + seatedPlayers.length) % seatedPlayers.length;
    }

    // Handle even number of reverses in non-2-player games  
    if (cards.filter(c => c.type === 'reverse').length % 2 === 0 && seatedPlayers.length > 2) {
      newDirection = game.direction; // Direction stays the same
    }
    
    // Convert seated index back to player array index
    const nextSeatedPlayer = seatedPlayers[nextSeatedIndex];
    const nextPlayerIndex = game.players.findIndex(p => p.id === nextSeatedPlayer?.id);
    
    const result = {
      nextPlayerIndex: nextPlayerIndex !== -1 ? nextPlayerIndex : game.currentPlayerIndex,
      newDirection,
      drawEffects: 0,
      skipEffects: skipCount,
      skippedPlayers
    };

    console.log('Turn advancement calculated:', {
      currentPlayerIndex: game.currentPlayerIndex,
      currentSeatedIndex,
      nextSeatedIndex,
      nextPlayerIndex: result.nextPlayerIndex,
      direction: newDirection,
      skipCount,
      skippedPlayers,
      seatedPlayersCount: seatedPlayers.length,
      reversesPlayed: cards.filter(c => c.type === 'reverse').length
    });
    
    return result;
  };

  // Scoring system functions
  const calculateCardPoints = (card: UnoCard): number => {
    if (card.type === 'number') {
      return card.value || 0;
    }
    if (card.type === 'skip' || card.type === 'reverse' || card.type === 'draw2') {
      return 20;
    }
    if (card.type === 'wild' || card.type === 'wild4') {
      return 50;
    }
    return 0;
  };

  const calculatePlayerScore = (hand: UnoCard[]): number => {
    return hand.reduce((total, card) => total + calculateCardPoints(card), 0);
  };

  const handleMatchEnd = async (winnerId: string) => {
    if (!game || !game.scoringEnabled) return;

    try {
      const matchScores: number[] = [];
      const newPlayerTotalScores = { ...game.playerTotalScores };
      const newEliminatedPlayers = [...game.eliminatedPlayers];

      // Calculate scores for each non-winning player
      game.players.forEach((player) => {
        let score = 0;
        if (player.id !== winnerId) {
          score = calculatePlayerScore(player.hand);
          
          // If winner played draw cards as final cards, auto-draw for next player
          const lastPlayedCards = game.selectedCards || [];
          const hasDrawCards = lastPlayedCards.some(card => card.type === 'draw2' || card.type === 'wild4');
          
          if (hasDrawCards && game.scoringEnabled) {
            // Find next player who would receive the draw
            const seatedPlayers = getSeatedPlayers();
            const winnerSeatedIndex = seatedPlayers.findIndex(p => p.id === winnerId);
            const nextPlayerSeatedIndex = (winnerSeatedIndex + game.direction + seatedPlayers.length) % seatedPlayers.length;
            const nextPlayer = seatedPlayers[nextPlayerSeatedIndex];
            
            if (player.id === nextPlayer?.id) {
              // Auto-draw cards for scoring
              const drawAmount = lastPlayedCards.reduce((sum, card) => {
                return sum + (card.type === 'draw2' ? 2 : card.type === 'wild4' ? 4 : 0);
              }, 0);
              
              const newDrawPile = [...game.drawPile];
              const additionalCards: UnoCard[] = [];
              for (let i = 0; i < drawAmount; i++) {
                if (newDrawPile.length > 0) {
                  additionalCards.push(newDrawPile.pop()!);
                }
              }
              score += additionalCards.reduce((sum, card) => sum + calculateCardPoints(card), 0);
            }
          }
        }
        
        matchScores.push(score);
        newPlayerTotalScores[player.id] = (newPlayerTotalScores[player.id] || 0) + score;
        
        // Check if player should be eliminated
        if (newPlayerTotalScores[player.id] >= (game.scoreLimit || 300) && !newEliminatedPlayers.includes(player.id)) {
          newEliminatedPlayers.push(player.id);
        }
      });

      // Update match scores
      const newMatchScores = [...game.matchScores, matchScores];

      // Check for final winner
      const remainingPlayers = game.players.filter(p => !newEliminatedPlayers.includes(p.id));
      const finalWinnerId = remainingPlayers.length === 1 ? remainingPlayers[0].id : null;

      await supabase.from('games').update({
        match_scores: newMatchScores as any,
        player_total_scores: newPlayerTotalScores as any,
        eliminated_players: newEliminatedPlayers as any,
        final_winner_id: finalWinnerId,
        game_state: finalWinnerId ? 'ended' : 'ended'
      }).eq('id', game.id);

    } catch (error) {
      console.error('Error handling match end:', error);
    }
  };

  const startNextMatch = async () => {
    if (!game || !game.scoringEnabled) return;

    try {
      // Remove eliminated players from seating
      const playersToRemove = game.eliminatedPlayers;
      for (const playerId of playersToRemove) {
        await supabase.from('players').update({
          seated: false,
          seated_position: null
        }).eq('game_id', game.id).eq('player_id', playerId);
      }

      // Reset game state for next match
      const deck = shuffleDeck(generateDeck());
      const remainingSeatedPlayers = game.players.filter(p => !game.eliminatedPlayers.includes(p.id) && p.seated);
      
      // Deal new hands
      for (const player of remainingSeatedPlayers) {
        const playerHand = deck.splice(0, 7);
        await supabase.from('players').update({
          hand: playerHand as any
        }).eq('game_id', game.id).eq('player_id', player.id);
      }

      const discardPile = [deck.pop()!];
      
      await supabase.from('games').update({
        current_match_number: game.currentMatchNumber + 1,
        current_player_index: 0,
        direction: 1,
        draw_pile: deck as any,
        discard_pile: discardPile as any,
        current_color: discardPile[0].color === 'wild' ? 'red' : discardPile[0].color,
        game_state: 'playing',
        winner_id: null,
        selected_cards: [],
        pending_draw_total: 0,
        pending_draw_type: null,
        stacking_timer: null,
        play_history: [{
          player: 'System',
          action: `Match ${game.currentMatchNumber + 1} started`
        }] as any
      }).eq('id', game.id);

    } catch (error) {
      console.error('Error starting next match:', error);
    }
  };

  const handleColorSelect = (color: CardColor) => {
    setSelectedColor(color);
    setShowColorSelect(false);
    if (pendingWildCards.length > 0) {
      executeCardPlay(pendingWildCards, color);
    }
  };
  const handleDrawTimeout = async () => {
    if (!game) return;
    try {
      // The current player (who failed to respond) must draw the pending cards
      const currentPlayer = game.players[game.currentPlayerIndex];

      // Only the current player should execute this
      if (currentPlayer?.id !== playerId) return;
      const newHand = [...currentPlayer.hand];
      const newDrawPile = [...game.drawPile];
      for (let i = 0; i < game.pendingDrawTotal; i++) {
        if (newDrawPile.length > 0) {
          newHand.unshift(newDrawPile.pop()!); // Add new cards to the left
        }
      }

      // Update current player's hand
      await supabase.from('players').update({
        hand: newHand as any
      }).eq('game_id', game.id).eq('player_id', currentPlayer.id);

      // Move to next player after current player draws and gets their turn skipped
      const seatedPlayers = getSeatedPlayers();
      const currentSeatedIndex = getCurrentSeatedPlayerIndex();
      const nextSeatedIndex = (currentSeatedIndex + game.direction + seatedPlayers.length) % seatedPlayers.length;
      const nextSeatedPlayer = seatedPlayers[nextSeatedIndex];
      const nextPlayerIndex = game.players.findIndex(p => p.id === nextSeatedPlayer?.id);
      
      // Store the draw card that was on top of discard pile for color matching
      const topDrawCard = game.discardPile[game.discardPile.length - 1];
      const newCurrentColor = topDrawCard?.color === 'wild' ? game.currentColor : topDrawCard?.color;
      
      await supabase.from('games').update({
        current_player_index: nextPlayerIndex,
        current_color: newCurrentColor, // Ensure next player can match draw card color
        pending_draw_total: 0,
        pending_draw_type: null,
        stacking_timer: null,
        draw_pile: newDrawPile as any,
        play_history: [...game.playHistory, {
          player: currentPlayer.name,
          action: `drew +${game.pendingDrawTotal} cards (timer expired)`
        }] as any
      }).eq('id', game.id);
      toast({
        title: `${currentPlayer.name} drew +${game.pendingDrawTotal} cards`,
        description: "Time ran out for draw card response",
        variant: "destructive"
      });
    } catch (error) {
      console.error('Error handling draw timeout:', error);
    }
  };

  // Draw card from pile
  const drawCards = async () => {
    if (!game || !myPlayer || gameState !== 'playing') return;

    // Check if it's the player's turn
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer?.id !== myPlayer.id) {
      toast({
        title: "Not your turn",
        description: "Wait for your turn to draw",
        variant: "destructive"
      });
      return;
    }
    try {
      const newDrawPile = [...game.drawPile];
      const newHand = [...myPlayer.hand];

      // If there are pending draw cards, draw all of them and skip turn
      // Otherwise, draw 1 card and continue turn (player must play a card)
      const drawAmount = game.pendingDrawTotal > 0 ? game.pendingDrawTotal : 1;
      const shouldSkipTurn = game.pendingDrawTotal > 0;
      for (let i = 0; i < drawAmount; i++) {
        if (newDrawPile.length === 0) {
          toast({
            title: "No cards left",
            description: "The draw pile is empty",
            variant: "destructive"
          });
          return;
        }
        newHand.unshift(newDrawPile.pop()!); // Add new cards to the left
      }

      // Update player's hand
      await supabase.from('players').update({
        hand: newHand as any
      }).eq('game_id', game.id).eq('player_id', playerId);

      // Only move to next player if forced to draw due to draw cards
      let nextPlayerIndex = game.currentPlayerIndex;
      let newCurrentColor = game.currentColor;
      
      if (shouldSkipTurn) {
        const seatedPlayers = getSeatedPlayers();
        const currentSeatedIndex = getCurrentSeatedPlayerIndex();
        const nextSeatedIndex = (currentSeatedIndex + game.direction + seatedPlayers.length) % seatedPlayers.length;
        const nextSeatedPlayer = seatedPlayers[nextSeatedIndex];
        nextPlayerIndex = game.players.findIndex(p => p.id === nextSeatedPlayer?.id);
        // After drawing stack, next player can match the color of the draw card on top
        const topDrawCard = game.discardPile[game.discardPile.length - 1];
        newCurrentColor = topDrawCard?.color === 'wild' ? game.currentColor : topDrawCard?.color;
      }
      
      const newPlayHistory = [...game.playHistory, {
        player: myPlayer.name,
        action: drawAmount > 1 ? `drew +${drawAmount} cards` : 'drew 1 card'
      }];
      await supabase.from('games').update({
        draw_pile: newDrawPile as any,
        current_player_index: nextPlayerIndex,
        current_color: newCurrentColor,
        pending_draw_total: shouldSkipTurn ? 0 : game.pendingDrawTotal,
        pending_draw_type: shouldSkipTurn ? null : game.pendingDrawType,
        stacking_timer: shouldSkipTurn ? null : game.stackingTimer,
        play_history: newPlayHistory as any
      }).eq('id', game.id);

      // Clear timer state only if turn ends
      if (shouldSkipTurn) {
        setDrawTimer(null);
        setTimerExpired(false);
      }

      // Show message about turn rules
      if (!shouldSkipTurn) {
        toast({
          title: "Continue your turn",
          description: "You must play a card or draw more cards"
        });
      }
    } catch (error) {
      console.error('Error drawing card:', error);
      toast({
        title: "Error",
        description: "Failed to draw card",
        variant: "destructive"
      });
    }
  };
  const createGame = async () => {
    if (!playerName.trim()) return;
    try {
      const deck = shuffleDeck(generateDeck());
      const playerHand = deck.splice(0, 7);
      const discardPile = [deck.pop()!];
      const gameCode = generateInviteCode();
      const {
        data: gameData,
        error: gameError
      } = await supabase.from('games').insert({
        host_id: playerId,
        invite_code: gameCode,
        max_players: 8,
        current_player_index: 0,
        direction: 1,
        draw_pile: deck as any,
        discard_pile: discardPile as any,
        current_color: discardPile[0].color === 'wild' ? 'red' : discardPile[0].color,
        game_state: 'waiting',
        scoring_enabled: scoringEnabled,
        score_limit: scoringEnabled ? scoreLimit : null
      }).select().single();
      if (gameError) throw gameError;
      await supabase.from('players').insert({
        game_id: gameData.id,
        player_id: playerId,
        name: playerName,
        hand: playerHand as any,
        position: 0,
        is_host: true
      });
      await loadGame(gameData.id);
      setGameState('waiting');
    } catch (error) {
      console.error('Error creating game:', error);
      toast({
        title: "Error",
        description: "Failed to create game",
        variant: "destructive"
      });
    }
  };
  const createGameWithBots = async () => {
    await createGame();
    // ... implement bot creation logic
  };
  const joinGame = async () => {
    if (!playerName.trim() || !inviteCode.trim()) return;
    try {
      const {
        data: gameData,
        error: gameError
      } = await supabase.from('games').select('*').eq('invite_code', inviteCode.toUpperCase()).single();
      if (gameError) throw gameError;
      const {
        data: existingPlayers
      } = await supabase.from('players').select('*').eq('game_id', gameData.id);
      if (existingPlayers && existingPlayers.length >= gameData.max_players) {
        toast({
          title: "Game full",
          description: "This game is already full",
          variant: "destructive"
        });
        return;
      }
      const deck = shuffleDeck(generateDeck());
      const playerHand = deck.splice(0, 7);
      await supabase.from('games').update({
        draw_pile: [...validateUnoCards(gameData.draw_pile).slice(0, -7), ...deck] as any
      }).eq('id', gameData.id);
      await supabase.from('players').insert({
        game_id: gameData.id,
        player_id: playerId,
        name: playerName,
        hand: playerHand as any,
        position: existingPlayers?.length || 0,
        is_host: false
      });

      // Add player join notification to game history
      const currentHistory = Array.isArray(gameData.play_history) ? gameData.play_history : [];
      await supabase.from('games').update({
        play_history: [...currentHistory, {
          player: playerName,
          action: "joined the game"
        }] as any
      }).eq('id', gameData.id);

      await loadGame(gameData.id);
      setGameState('playing'); // Join directly into game

      // Show join notification on all screens
      toast({
        title: "Player joined!",
        description: `${playerName} joined the game`
      });

      // Scroll to top for new players
      window.scrollTo(0, 0);
    } catch (error) {
      console.error('Error joining game:', error);
      toast({
        title: "Error",
        description: "Failed to join game",
        variant: "destructive"
      });
    }
  };
  const startGame = async () => {
    if (!game || game.players.length < 2) return;
    await supabase.from('games').update({
      game_state: 'seating'
    }).eq('id', game.id);
  };

  const beginGame = async () => {
    if (!game) return;
    const seatedPlayers = game.players.filter(p => p.seated);
    if (seatedPlayers.length < 2) return;
    
    await supabase.from('games').update({
      game_state: 'playing'
    }).eq('id', game.id);
  };

  const seatPlayer = async (playerId: string, position: number) => {
    if (!game || !myPlayer?.isHost) return;
    
    // Check if position is already taken
    const positionTaken = game.players.some(p => p.seatedPosition === position && p.seated);
    if (positionTaken) return;
    
    await supabase.from('players').update({
      seated: true,
      seated_position: position,
      position: position
    }).eq('player_id', playerId).eq('game_id', game.id);
  };

  const unseatPlayer = async (playerId: string) => {
    if (!game || !myPlayer?.isHost) return;
    
    await supabase.from('players').update({
      seated: false,
      seated_position: null
    }).eq('player_id', playerId).eq('game_id', game.id);
  };
  const copyInviteLink = () => {
    const link = `${window.location.origin}?game=${game?.inviteCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Invite link copied!",
      description: "Share this link with other players"
    });
  };

  // Sort player hand - prioritize numbers first, then specials to the left
  const sortHand = async () => {
    if (!myPlayer) return;
    const sortedHand = [...myPlayer.hand].sort((a, b) => {
      // Special cards first (to the left)
      const aIsSpecial = a.type !== 'number';
      const bIsSpecial = b.type !== 'number';
      if (aIsSpecial && !bIsSpecial) return -1;
      if (!aIsSpecial && bIsSpecial) return 1;

      // For number cards, sort by number value first, then color
      if (a.type === 'number' && b.type === 'number') {
        const numberDiff = (a.value || 0) - (b.value || 0);
        if (numberDiff !== 0) return numberDiff;

        // Same number, sort by color
        const colorOrder = {
          'red': 0,
          'blue': 1,
          'green': 2,
          'yellow': 3
        };
        return colorOrder[a.color] - colorOrder[b.color];
      }

      // For special cards, sort by type then color
      if (aIsSpecial && bIsSpecial) {
        const typeOrder = {
          'skip': 0,
          'reverse': 1,
          'draw2': 2,
          'wild': 3,
          'wild4': 4
        };
        const typeDiff = typeOrder[a.type] - typeOrder[b.type];
        if (typeDiff !== 0) return typeDiff;
        if (a.color !== 'wild' && b.color !== 'wild') {
          const colorOrder = {
            'red': 0,
            'blue': 1,
            'green': 2,
            'yellow': 3
          };
          return colorOrder[a.color] - colorOrder[b.color];
        }
      }
      return 0;
    });
    await supabase.from('players').update({
      hand: sortedHand as any
    }).eq('game_id', game?.id).eq('player_id', playerId);
  };

  // Visual helper functions
  const getCardColorClasses = (card: UnoCard): string => {
    const baseClasses = "uno-card border-2 border-white";
    switch (card.color) {
      case 'red':
        return `${baseClasses} uno-card-red`;
      case 'blue':
        return `${baseClasses} uno-card-blue`;
      case 'green':
        return `${baseClasses} uno-card-green`;
      case 'yellow':
        return `${baseClasses} uno-card-yellow`;
      case 'wild':
        return `${baseClasses} uno-card-wild`;
      default:
        return baseClasses;
    }
  };
  const getColorIndicatorClass = (color: CardColor): string => {
    switch (color) {
      case 'red':
        return 'bg-red-600 text-white';
      case 'blue':
        return 'bg-blue-600 text-white';
      case 'green':
        return 'bg-green-600 text-white';
      case 'yellow':
        return 'bg-yellow-500 text-black';
      case 'wild':
        return 'bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 to-blue-500 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };
  const renderCard = (card: UnoCard, index?: number, onClick?: () => void, isSmall = false, isSelected = false) => {
    const sizeClasses = isSmall ? 'w-8 h-12 text-xs' : 'w-12 h-16 sm:w-14 sm:h-20';
    const selectedClasses = isSelected ? 'ring-2 ring-blue-400 transform -translate-y-2' : '';
    const selectionNumber = selectedCards.findIndex(c => c.id === card.id) + 1;
    return <div key={card.id} className={`${getCardColorClasses(card)} ${sizeClasses} ${selectedClasses} flex items-center justify-center cursor-pointer relative transition-all duration-200`} onClick={onClick}>
        {isSelected && <div className="absolute -top-3 -right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold z-10">
            {selectionNumber}
          </div>}
        
        {/* Top-left corner with black outline */}
        <div className="absolute top-1 left-1 text-white font-bold text-xs" style={{
        textShadow: '1px 1px 0 black, -1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black'
      }}>
          {card.type === 'number' ? card.value : card.type === 'skip' ? 'S' : card.type === 'reverse' ? 'R' : card.type === 'draw2' ? '+2' : card.type === 'wild' ? 'W' : '+4'}
        </div>
        
        {/* Center display with black outline */}
        <div className="text-white font-bold text-lg" style={{
        textShadow: '1px 1px 0 black, -1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black'
      }}>
          {card.type === 'number' ? card.value : card.type === 'skip' ? 'S' : card.type === 'reverse' ? 'R' : card.type === 'draw2' ? '+2' : card.type === 'wild' ? 'W' : '+4'}
        </div>
        
        {/* Bottom-right corner with black outline */}
        <div className="absolute bottom-1 right-1 text-white font-bold text-xs" style={{
        textShadow: '1px 1px 0 black, -1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black'
      }}>
          {card.type === 'number' ? card.value : card.type === 'skip' ? 'S' : card.type === 'reverse' ? 'R' : card.type === 'draw2' ? '+2' : card.type === 'wild' ? 'W' : '+4'}
        </div>
      </div>;
  };

  // Hexagon positioning for players (supporting up to 8 players)
  const getPlayerPosition = (index: number, totalPlayers: number) => {
    const positions = {
      2: [{
        top: '10%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        bottom: '30%',
        left: '50%',
        transform: 'translateX(-50%)'
      }],
      3: [{
        top: '10%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        bottom: '30%',
        left: '20%',
        transform: 'translateX(-50%)'
      }, {
        bottom: '30%',
        left: '80%',
        transform: 'translateX(-50%)'
      }],
      4: [{
        top: '10%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        top: '50%',
        right: '10%',
        transform: 'translateY(-50%)'
      }, {
        bottom: '30%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        top: '50%',
        left: '10%',
        transform: 'translateY(-50%)'
      }],
      5: [{
        top: '10%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        top: '25%',
        right: '15%',
        transform: 'translateY(-50%)'
      }, {
        bottom: '35%',
        right: '15%',
        transform: 'translateY(50%)'
      }, {
        bottom: '30%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        bottom: '35%',
        left: '15%',
        transform: 'translateY(50%)'
      }],
      6: [{
        top: '10%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        top: '25%',
        right: '10%',
        transform: 'translateY(-50%)'
      }, {
        bottom: '35%',
        right: '10%',
        transform: 'translateY(50%)'
      }, {
        bottom: '30%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        bottom: '35%',
        left: '10%',
        transform: 'translateY(50%)'
      }, {
        top: '25%',
        left: '10%',
        transform: 'translateY(-50%)'
      }],
      7: [{
        top: '10%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        top: '20%',
        right: '8%',
        transform: 'translateY(-50%)'
      }, {
        bottom: '40%',
        right: '8%',
        transform: 'translateY(50%)'
      }, {
        bottom: '30%',
        right: '35%',
        transform: 'translateX(50%)'
      }, {
        bottom: '30%',
        left: '35%',
        transform: 'translateX(-50%)'
      }, {
        bottom: '40%',
        left: '8%',
        transform: 'translateY(50%)'
      }, {
        top: '20%',
        left: '8%',
        transform: 'translateY(-50%)'
      }],
      8: [{
        top: '10%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        top: '20%',
        right: '8%',
        transform: 'translateY(-50%)'
      }, {
        top: '50%',
        right: '5%',
        transform: 'translateY(-50%)'
      }, {
        bottom: '35%',
        right: '8%',
        transform: 'translateY(50%)'
      }, {
        bottom: '30%',
        left: '50%',
        transform: 'translateX(-50%)'
      }, {
        bottom: '35%',
        left: '8%',
        transform: 'translateY(50%)'
      }, {
        top: '50%',
        left: '5%',
        transform: 'translateY(-50%)'
      }, {
        top: '20%',
        left: '8%',
        transform: 'translateY(-50%)'
      }]
    };
    return positions[totalPlayers as keyof typeof positions]?.[index] || positions[4][index % 4];
  };

  // Main game screen - show console log for debugging
  console.log('About to render, gameState:', gameState, 'game:', game);

  // Show appropriate UI based on game state
  if (gameState === 'lobby') {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-white">ROSS UNO STACKS</CardTitle>
            <div className="text-sm text-gray-400 text-center mt-1">
              Build: {new Date().toLocaleTimeString('en-US', { 
                timeZone: 'America/New_York', 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
              }).replace(':', '')}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="playerName" className="text-white">Your Name</Label>
              <Input id="playerName" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Enter your name" className="bg-gray-700 border-gray-600 text-white" />
            </div>
            
            <div className="border-t border-gray-600 pt-4">
              <Label htmlFor="joinCode" className="text-white">Join with Invite Code</Label>
              <div className="flex space-x-2 mt-2">
                <Input id="joinCode" value={joinGameCode} onChange={e => setJoinGameCode(e.target.value.toUpperCase())} placeholder="Enter invite code" className="bg-gray-700 border-gray-600 text-white" maxLength={6} />
                <Button onClick={() => {
                setInviteCode(joinGameCode);
                setGameState('joining');
              }} disabled={!joinGameCode.trim() || !playerName.trim()} size="sm">
                  Join
                </Button>
              </div>
            </div>

            <div className="text-sm text-gray-400 text-center mb-4">
              Up to 8 players can join your game
            </div>
            
            <Button onClick={createGame} disabled={!playerName.trim()} className="w-full bg-[#09fd09] rounded-md text-slate-50 text-base">
              Create Game
            </Button>
            
            <Button onClick={() => createGameWithBots()} className="w-full" disabled={!playerName.trim()} variant="outline">
              Play with Bots
            </Button>

            <div className="border-t border-gray-600 pt-4">
              <div className="flex items-center space-x-2 mb-4">
                <Checkbox 
                  id="scoring" 
                  checked={scoringEnabled} 
                  onCheckedChange={(checked) => setScoringEnabled(checked === true)}
                />
                <Label htmlFor="scoring" className="text-white">Scoring</Label>
                <Input 
                  type="number" 
                  value={scoreLimit} 
                  onChange={(e) => setScoreLimit(parseInt(e.target.value) || 300)}
                  disabled={!scoringEnabled}
                  placeholder="Score Limit"
                  className="w-24 bg-gray-700 border-gray-600 text-white disabled:opacity-50"
                  min={100}
                  max={1000}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>;
  }
  if (gameState === 'joining') {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-white">Join Game</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="playerName" className="text-white">Your Name</Label>
              <Input id="playerName" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Enter your name" className="bg-gray-700 border-gray-600 text-white" />
            </div>
            
            <div>
              <Label className="text-white">Game Code: {inviteCode}</Label>
            </div>

            <Button onClick={joinGame} className="w-full" disabled={!playerName.trim()}>
              Join Game
            </Button>
          </CardContent>
        </Card>
      </div>;
  }

  // Show game end overlay instead of switching screens
  const renderGameEndOverlay = () => {
    if (gameState !== 'ended') return null;
    const winner = game?.players.find(p => p.id === game.winnerId);
    const newGame = async () => {
      if (!game) return;
      const deck = shuffleDeck(generateDeck());
      const newHands: {
        [playerId: string]: UnoCard[];
      } = {};

      // Deal new hands to all players
      game.players.forEach(player => {
        newHands[player.id] = deck.splice(0, 7);
      });
      const discardPile = [deck.pop()!];

      // Update all players' hands
      for (const player of game.players) {
        await supabase.from('players').update({
          hand: newHands[player.id] as any
        }).eq('game_id', game.id).eq('player_id', player.id);
      }

      // Reset game state
      await supabase.from('games').update({
        draw_pile: deck as any,
        discard_pile: discardPile as any,
        stacked_discard: [] as any,
        current_color: discardPile[0].color === 'wild' ? 'red' : discardPile[0].color,
        current_player_index: 0,
        direction: 1,
        pending_draw_total: 0,
        pending_draw_type: null,
        stacking_timer: null,
        play_history: [] as any,
        last_played_card: null,
        selected_cards: [] as any,
        winner_id: null,
        game_state: 'seating',
        expanded_hand_player: null
      }).eq('id', game.id);
    };
    return <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        {winner && <Confetti />}
        <Card className="bg-gray-800 border-gray-700 text-center p-6">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Trophy className="w-8 h-8 text-yellow-400" />
            <h2 className="text-2xl font-bold text-white">Game Over!</h2>
          </div>
          <p className="text-xl text-white mb-4">
            {winner?.name} wins!
          </p>
          <div className="flex space-x-2">
            <Button onClick={newGame} className="flex-1">
              Play Again
            </Button>
            <Button onClick={() => setGameState('lobby')} variant="outline" className="flex-1">
              New Game
            </Button>
          </div>
        </Card>
      </div>;
  };

  // If we get here, game must exist
  if (!game) return null;
  
  const actualColor = topCard?.color === 'wild' ? game.currentColor : topCard?.color;
  
  // Player references
  const currentPlayer = game.players[game.currentPlayerIndex];
  const myPlayer = game.players.find(p => p.id === playerId);
  const lastMove = game.playHistory[game.playHistory.length - 1];

  // Create placeholder players for empty slots
  const allSlots = [];
  for (let i = 0; i < game.maxPlayers; i++) {
    const existingPlayer = game.players.find(p => p.position === i);
    if (existingPlayer) {
      allSlots.push(existingPlayer);
    } else {
      allSlots.push({
        id: `placeholder-${i}`,
        name: `Player ${i + 1}`,
        hand: [],
        position: i,
        isHost: false
      });
    }
  }
  return <div className="min-h-screen bg-gray-900 flex flex-col overflow-hidden">
      {/* Top bar - compressed for mobile */}
      <div className="flex justify-between items-center p-1 sm:p-2 shrink-0">
        <div className="bg-gray-800 rounded-lg p-1 sm:p-2 shadow-lg">
          {gameState === 'waiting' ? <div className="text-white">
              <div className="text-xs sm:text-sm font-bold">Waiting for players...</div>
              <div className="text-xs">{game.players.length}/{game.maxPlayers} players</div>
            </div> : gameState === 'seating' ? <div className="text-white">
              <div className="text-xs sm:text-sm font-bold">Seating players...</div>
              <div className="text-xs">{game.players.filter(p => p.seated).length}/{game.players.length} seated</div>
            </div> : <div className="text-left">
              <div className="flex items-center space-x-1 sm:space-x-2">
                <span className="text-xs sm:text-sm font-bold text-white">Turn: {currentPlayer?.name}</span>
                <div className={`px-1 sm:px-2 py-1 rounded text-xs text-white ${getColorIndicatorClass(actualColor!)}`}>
                  {actualColor?.toUpperCase()}
                </div>
                <div className="flex items-center">
                  {game.direction === 1 ? <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 text-white" /> : <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                </div>
              </div>
              {lastMove && <div className="text-xs text-white">
                  {lastMove.player}: {lastMove.action}
                </div>}
            </div>}
        </div>

        {/* Timer and actions */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          <Button onClick={() => setShowHistory(!showHistory)} variant="outline" size="sm">
            History
          </Button>
          
          {gameState === 'waiting' && myPlayer?.isHost && <Button onClick={startGame} size="sm" disabled={game.players.length < 2}>
              Start Game
            </Button>}
          
          {gameState === 'waiting' && <div className="text-center">
              <Button onClick={copyInviteLink} className="bg-green-600 hover:bg-green-700 text-white" size="sm">
                {copied ? <Check className="w-4 h-4 mr-1" /> : null}
                Invite Players
              </Button>
              <div className="text-xs text-white mt-1">Game ID: {game?.inviteCode}</div>
              {!myPlayer?.isHost && <div className="text-xs text-gray-400 mt-1">Please wait while the host sets up the match</div>}
            </div>}

          {gameState === 'seating' && myPlayer?.isHost && <Button onClick={beginGame} size="sm" disabled={game.players.filter(p => p.seated).length < 2}>
              Begin Game
            </Button>}
        </div>
      </div>

      {/* Seating UI */}
      {gameState === 'seating' && (
        <div className="p-4 bg-gray-800 mx-4 rounded-lg mb-4">
          <h3 className="text-white text-lg font-bold mb-3 text-center">Seat Players</h3>
          {/* Unseated Players */}
          <div className="mb-4">
            <p className="text-white text-sm mb-2">Available Players:</p>
            <div className="flex flex-wrap gap-2">
              {game.players.filter(p => !p.seated).map(player => (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayerForSeating(selectedPlayerForSeating === player.id ? null : player.id)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedPlayerForSeating === player.id 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {player.name} {player.isHost && '(Host)'}
                </button>
              ))}
            </div>
            {selectedPlayerForSeating && (
              <p className="text-blue-400 text-xs mt-1">Click an empty seat to place {game.players.find(p => p.id === selectedPlayerForSeating)?.name}</p>
            )}
          </div>
        </div>
      )}

      {/* Game area - relative positioning for mobile */}
      <div className="flex-1 relative overflow-hidden" style={{
      height: 'calc(100vh - 8rem)'
    }}>
        {/* Player positions - for both seating and playing */}
        {Array.from({ length: gameState === 'seating' ? 8 : game.players.filter(p => p.seated).length }, (_, index) => {
          // During seating, use index directly. During gameplay, map to actual seated positions
          const actualPosition = gameState === 'seating' ? index : game.players.filter(p => p.seated).sort((a, b) => a.seatedPosition! - b.seatedPosition!)[index]?.seatedPosition;
          if (gameState === 'playing' && actualPosition === undefined) return null;
          
          const position = getPlayerPosition(actualPosition ?? index, 8);
          // Adjust top position to account for increased spacing
          const adjustedPosition = (actualPosition ?? index) === 0 ? {
            ...position,
            top: '15%'
          } : position;
          
          const seatedPlayer = game.players.find(p => p.seated && p.seatedPosition === (actualPosition ?? index));
          const currentPlayer = game.players[game.currentPlayerIndex];
          const isCurrentPlayer = gameState === 'playing' && seatedPlayer?.id === currentPlayer?.id;
          const isClickable = gameState === 'seating' && myPlayer?.isHost;
          
          return (
            <div 
              key={index} 
              className="absolute" 
              style={adjustedPosition}
              onClick={() => {
                if (gameState === 'seating' && myPlayer?.isHost) {
                  const positionIndex = actualPosition ?? index;
                  if (seatedPlayer) {
                    // Unseat player
                    unseatPlayer(seatedPlayer.id);
                  } else if (selectedPlayerForSeating) {
                    // Seat selected player
                    seatPlayer(selectedPlayerForSeating, positionIndex);
                    setSelectedPlayerForSeating(null);
                  }
                }
              }}
            >
              <div className={`
                bg-gray-800 rounded-lg p-1 sm:p-2 shadow-lg text-center min-w-[60px] sm:min-w-[80px] 
                ${isCurrentPlayer ? 'ring-2 ring-blue-400' : ''} 
                ${isClickable ? 'hover:bg-gray-700 cursor-pointer' : ''}
                ${gameState === 'seating' && !seatedPlayer && selectedPlayerForSeating ? 'ring-2 ring-green-400 hover:ring-green-300' : ''}
              `}>
                <div className="text-white text-xs sm:text-sm font-bold">
                  {seatedPlayer ? seatedPlayer.name : gameState === 'seating' ? `Seat ${(actualPosition ?? index) + 1}` : 'Empty'}
                </div>
                {seatedPlayer && <div className="text-gray-400 text-xs">
                    {gameState === 'playing' ? `${seatedPlayer.hand.length} cards` : 'Seated'}
                  </div>}
                {gameState === 'seating' && !seatedPlayer && (
                  <div className="text-gray-500 text-xs">Empty</div>
                )}
              </div>
            </div>
          );
        })}

        {/* Center play area - more compact */}
        <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center space-y-2">
          {/* Draw timer and info above deck */}
          {drawTimer && <div className="bg-red-600 text-white px-3 py-2 rounded-lg text-center font-bold">
              <div className="text-xl font-bold">{drawTimer}</div>
              <div className="text-sm">Draw</div>
              <div className="text-lg font-bold">+{game.pendingDrawTotal} cards</div>
            </div>}
          
          {/* Flashing green arrow when cards selected - centered above discard pile */}
          {selectedCards.length > 0 && <div className="animate-bounce text-green-400 text-2xl absolute -top-10 left-1/2 transform -translate-x-1/2">
              ⬇️
            </div>}
          
          {/* Cards area */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Draw pile */}
            <div className="relative" onClick={drawCards}>
              <div className="w-12 h-16 sm:w-14 sm:h-20 bg-gray-600 border-2 border-white rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-500">
                <span className="text-white font-bold text-xs sm:text-sm" style={{
                textShadow: '1px 1px 0 black'
              }}>
                  DRAW
                </span>
              </div>
            </div>

            {/* Discard pile */}
            <div className="relative">
              {game.stackedDiscard.length > 0 ?
            // Show stacked cards
            <div className="relative">
                  {game.stackedDiscard.slice(-3).map((card, index) => <div key={`stacked-${index}`} className="absolute" style={{
                zIndex: index,
                transform: `translate(${index * 2}px, ${index * -2}px)`
              }} onClick={selectedCards.length > 0 ? playSelectedCards : undefined}>
                      {renderCard(card)}
                    </div>)}
                </div> : topCard ? <div onClick={selectedCards.length > 0 ? playSelectedCards : undefined}>
                  {renderCard(topCard)}
                </div> : <div className="w-12 h-16 sm:w-14 sm:h-20 bg-gray-600 border-2 border-white rounded-lg"></div>}
            </div>
          </div>
        </div>

        {/* Player hand view - improved layout with no overlap */}
        {myPlayer && <div className="absolute bottom-2 left-4 right-4 z-20">
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 mx-auto" style={{
          maxWidth: 'calc(100vw - 2rem)'
        }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-bold text-sm">{myPlayer.name} ({myPlayer.hand.length} cards)</span>
                <div className="flex items-center space-x-2">
                  <button onClick={sortHand} className="p-1 bg-gray-700 rounded text-white hover:bg-gray-600 text-xs">
                    Sort
                  </button>
                  <button onClick={() => setExpandedHand(!expandedHand)} className="p-1 bg-gray-700 rounded text-white hover:bg-gray-600">
                    {expandedHand ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              {expandedHand ? <div className="grid grid-cols-7 gap-2 pb-2" style={{
            maxHeight: '18rem',
            overflowY: 'auto',
            paddingTop: '2rem' // Space for selection numbers
          }}>
                  {myPlayer.hand.map((card, index) => {
              const isSelected = selectedCards.some(c => c.id === card.id);
              return <div key={card.id} className="cursor-pointer relative z-10" onClick={() => selectCard(card, index)} style={{
                minHeight: '6rem'
              }}>
                        {renderCard(card, index, undefined, false, isSelected)}
                      </div>;
            })}
                </div> : <div className="flex space-x-1 overflow-x-auto pb-2" style={{
            maxWidth: '100%',
            paddingTop: '1rem' // Space for selection numbers
          }}>
                  {myPlayer.hand.map((card, index) => {
              const isSelected = selectedCards.some(c => c.id === card.id);
              return <div key={card.id} className="cursor-pointer flex-shrink-0 relative z-10" onClick={() => selectCard(card, index)} style={{
                minHeight: '6rem'
              }}>
                        {renderCard(card, index, undefined, false, isSelected)}
                      </div>;
            })}
                </div>}
            </div>
          </div>}
        
        {/* Show expanded hand for other players */}
        {game.expandedHandPlayer && game.expandedHandPlayer !== playerId && <div className="absolute inset-4 bg-gray-800 border border-gray-600 rounded-lg p-4 z-30">
            <div className="flex items-center justify-between mb-4">
              <span className="text-white font-bold">
                {game.players.find(p => p.id === game.expandedHandPlayer)?.name}'s Hand
              </span>
              <div className="flex items-center space-x-2">
                <button onClick={() => {
              supabase.from('games').update({
                expanded_hand_player: null
              }).eq('id', game.id);
            }} className="p-1 bg-gray-700 rounded text-white hover:bg-gray-600">
                  <ZoomOut className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2 overflow-y-auto" style={{
          maxHeight: '60vh'
        }}>
              {game.players.find(p => p.id === game.expandedHandPlayer)?.hand.map((card, index) => <div key={card.id} className="relative">
                  {renderCard(card, index, undefined, false, false)}
                </div>)}
            </div>
          </div>}
      </div>

      {renderGameEndOverlay()}

      {/* Modals */}
      {showColorSelect && <ColorSelectModal onColorSelect={handleColorSelect} onClose={() => setShowColorSelect(false)} />}

      {/* Game History Modal */}
      {showHistory && <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-4 max-w-md w-full max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Game History</h3>
              <Button onClick={() => setShowHistory(false)} variant="outline" size="sm">
                Close
              </Button>
            </div>
            <div className="space-y-2">
              {game.playHistory.map((move, index) => <div key={index} className="text-sm text-gray-300 bg-gray-700 p-2 rounded">
                  <strong>{move.player}:</strong> {move.action}
                </div>)}
              {game.playHistory.length === 0 && <div className="text-gray-400 text-center">No moves yet</div>}
            </div>
          </div>
        </div>}
    </div>;
}