import { useState, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, ArrowRight, Trophy, History, Copy, Check, ZoomIn, ZoomOut, Clock } from 'lucide-react'
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"

// Types
type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild'
type CardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'
type GameState = 'lobby' | 'waiting' | 'playing' | 'ended' | 'color-select' | 'joining'

interface UnoCard {
  id: string
  color: CardColor
  type: CardType
  value?: number
}

interface Player {
  id: string
  name: string
  hand: UnoCard[]
  position: number
  isHost: boolean
}

interface Game {
  id: string
  hostId: string
  inviteCode: string
  maxPlayers: number
  currentPlayerIndex: number
  direction: 1 | -1
  drawPile: UnoCard[]
  discardPile: UnoCard[]
  currentColor: CardColor
  drawCount: number
  pendingWildCard?: UnoCard
  lastPlayedCard?: UnoCard
  playHistory: { player: string; action: string }[]
  gameState: string
  winnerId?: string
  players: Player[]
  selectedCards: UnoCard[]
  stackingTimer?: string
  pendingDrawTotal: number
  pendingDrawType?: string
  stackedDiscard: UnoCard[]
  expandedHandPlayer?: string
}

// Card generation
const colors: CardColor[] = ['red', 'blue', 'green', 'yellow']
const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function generateDeck(): UnoCard[] {
  const deck: UnoCard[] = []
  
  colors.forEach(color => {
    deck.push({ id: `${color}-0`, color, type: 'number', value: 0 })
    numbers.slice(1).forEach(num => {
      deck.push({ id: `${color}-${num}`, color, type: 'number', value: num })
      deck.push({ id: `${color}-${num}-2`, color, type: 'number', value: num })
    })
  })
  
  colors.forEach(color => {
    ['skip', 'reverse', 'draw2'].forEach(type => {
      deck.push({ id: `${color}-${type}`, color, type: type as CardType })
      deck.push({ id: `${color}-${type}-2`, color, type: type as CardType })
    })
  })
  
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `wild-${i}`, color: 'wild', type: 'wild' })
    deck.push({ id: `wild4-${i}`, color: 'wild', type: 'wild4' })
  }
  
  return deck
}

function shuffleDeck(deck: UnoCard[]): UnoCard[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function getColorClasses(color: CardColor): string {
  const baseClasses = "border-2 border-white"
  switch (color) {
    case 'red': return `${baseClasses} bg-red-500 text-white`
    case 'blue': return `${baseClasses} bg-blue-500 text-white`
    case 'green': return `${baseClasses} bg-green-500 text-white`
    case 'yellow': return `${baseClasses} bg-yellow-400 text-black`
    case 'wild': return `${baseClasses} bg-gradient-to-br from-purple-600 to-pink-600 text-white`
    default: return baseClasses
  }
}

// Confetti component
function Confetti() {
  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {[...Array(50)].map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 bg-gradient-to-br from-yellow-400 via-red-500 to-blue-500 rounded-full animate-bounce"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-10px`,
            animationDelay: `${Math.random() * 2}s`,
            animationDuration: `${2 + Math.random() * 2}s`
          }}
        />
      ))}
    </div>
  )
}

// Color Selection Modal
function ColorSelectModal({ onColorSelect, onClose }: { onColorSelect: (color: CardColor) => void, onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        <h3 className="text-xl font-bold text-white text-center">Choose a Color</h3>
        <div className="grid grid-cols-2 gap-4">
          {colors.map(color => (
            <button
              key={color}
              onClick={() => onColorSelect(color)}
              className={`w-16 h-16 rounded-lg ${getColorClasses(color)} hover:scale-110 transition-transform`}
            >
              <span className="text-white font-bold text-sm" style={{ textShadow: '1px 1px 0 black' }}>
                {color.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
        <Button onClick={onClose} variant="outline" className="w-full">
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default function UnoGame() {
  const [gameState, setGameState] = useState<GameState>('lobby')
  const [game, setGame] = useState<Game | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [selectedColor, setSelectedColor] = useState<CardColor | null>(null)
  const [playerId] = useState(() => Math.random().toString(36).substring(7))
  const [showHistory, setShowHistory] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [selectedCards, setSelectedCards] = useState<UnoCard[]>([])
  const [showColorSelect, setShowColorSelect] = useState(false)
  const [pendingWildCards, setPendingWildCards] = useState<UnoCard[]>([])
  const [expandedHand, setExpandedHand] = useState(false)
  const [drawTimer, setDrawTimer] = useState<number | null>(null)
  const [timerExpired, setTimerExpired] = useState(false)
  const { toast } = useToast()

  // Timer effect for draw card response
  useEffect(() => {
    if (drawTimer && drawTimer > 0) {
      const interval = setInterval(() => {
        setDrawTimer(prev => {
          if (prev && prev <= 1) {
            setTimerExpired(true)
            handleDrawTimeout()
            return null
          }
          return prev ? prev - 1 : null
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [drawTimer])

  // Check for invite code in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const gameCode = urlParams.get('game')
    if (gameCode) {
      setInviteCode(gameCode)
      setGameState('joining')
    }
  }, [])

  // Real-time subscription
  useEffect(() => {
    if (!game?.id) return

    const channel = supabase
      .channel('game-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${game.id}`
        },
        () => {
          loadGame(game.id)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${game.id}`
        },
        () => {
          loadGame(game.id)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [game?.id])

  const loadGame = async (gameId: string) => {
    try {
      // Load game data
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (gameError) throw gameError

      // Load players
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId)
        .order('position')

      if (playersError) throw playersError

      // Transform to match our interface
      const transformedGame: Game = {
        id: gameData.id,
        hostId: gameData.host_id,
        inviteCode: gameData.invite_code,
        maxPlayers: gameData.max_players,
        currentPlayerIndex: gameData.current_player_index,
        direction: gameData.direction as 1 | -1,
        drawPile: (gameData.draw_pile as unknown as UnoCard[]) || [],
        discardPile: (gameData.discard_pile as unknown as UnoCard[]) || [],
        currentColor: gameData.current_color as CardColor,
        drawCount: gameData.draw_count,
        lastPlayedCard: gameData.last_played_card as unknown as UnoCard,
        playHistory: (gameData.play_history as unknown as { player: string; action: string }[]) || [],
        gameState: gameData.game_state,
        winnerId: gameData.winner_id,
        selectedCards: (gameData.selected_cards as unknown as UnoCard[]) || [],
        stackingTimer: gameData.stacking_timer,
        pendingDrawTotal: gameData.pending_draw_total || 0,
        pendingDrawType: gameData.pending_draw_type,
        stackedDiscard: (gameData.stacked_discard as unknown as UnoCard[]) || [],
        expandedHandPlayer: gameData.expanded_hand_player,
        players: playersData.map(p => ({
          id: p.player_id,
          name: p.name,
          hand: (p.hand as unknown as UnoCard[]) || [],
          position: p.position,
          isHost: p.is_host
        }))
      }

      setGame(transformedGame)
      setGameState(transformedGame.gameState as GameState)

      // Handle timer for current player
      if (transformedGame.stackingTimer && transformedGame.pendingDrawTotal > 0) {
        const currentPlayer = transformedGame.players[transformedGame.currentPlayerIndex]
        if (currentPlayer?.id === playerId) {
          const timerEnd = new Date(transformedGame.stackingTimer).getTime()
          const now = Date.now()
          const remaining = Math.max(0, Math.ceil((timerEnd - now) / 1000))
          setDrawTimer(remaining)
        }
      }

    } catch (error) {
      console.error('Error loading game:', error)
    }
  }

  // Card selection functions
  const selectCard = (card: UnoCard, cardIndex: number) => {
    if (!game || !myPlayer || gameState !== 'playing') return
    
    // Check if it's the player's turn
    if (game.currentPlayerIndex !== myPlayer.position) {
      toast({
        title: "Not your turn",
        description: "Wait for your turn to select cards",
        variant: "destructive"
      })
      return
    }

    // If in draw response mode, only allow matching draw cards
    if (game.pendingDrawTotal > 0 && game.pendingDrawType) {
      if (!canPlayDrawCard(card)) {
        toast({
          title: "Invalid card",
          description: "You can only play matching draw cards or draw the cards",
          variant: "destructive"
        })
        return
      }
    }

    const isAlreadySelected = selectedCards.some(c => c.id === card.id)
    
    if (isAlreadySelected) {
      // Deselect card
      setSelectedCards(prev => prev.filter(c => c.id !== card.id))
    } else {
      // Select card - validate for stacking
      if (selectedCards.length === 0) {
        // First card - check if it can be played
        if (canPlayCard(card)) {
          setSelectedCards([card])
        } else {
          toast({
            title: "Invalid card",
            description: "This card cannot be played",
            variant: "destructive"
          })
        }
      } else {
        // Additional card - must match value for stacking
        const firstCard = selectedCards[0]
        if (canStackCard(firstCard, card)) {
          setSelectedCards(prev => [...prev, card])
        } else {
          toast({
            title: "Cannot stack",
            description: "You can only stack cards with the same value",
            variant: "destructive"
          })
        }
      }
    }
  }

  const canStackCard = (firstCard: UnoCard, newCard: UnoCard): boolean => {
    // Can stack cards with same value
    if (firstCard.type === 'number' && newCard.type === 'number') {
      return firstCard.value === newCard.value
    }
    
    // Can stack same special cards
    if (firstCard.type === newCard.type && firstCard.type !== 'number') {
      return true
    }
    
    return false
  }

  const canPlayCard = (card: UnoCard): boolean => {
    if (!topCard || !game) return false
    
    // In draw response mode, only matching draw cards allowed
    if (game.pendingDrawTotal > 0 && game.pendingDrawType) {
      return canPlayDrawCard(card)
    }
    
    // Wild cards can always be played (except during draw response)
    if (card.color === 'wild') return true
    
    // Card matches color or type/value
    return card.color === game.currentColor || 
           (card.type === topCard.type && card.type !== 'wild') ||
           (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value)
  }

  const canPlayDrawCard = (card: UnoCard): boolean => {
    if (!game.pendingDrawType) return false
    
    // Can only play matching draw card type
    if (game.pendingDrawType === 'draw2' && card.type === 'draw2') return true
    if (game.pendingDrawType === 'wild4' && card.type === 'wild4') return true
    
    return false
  }

  const playSelectedCards = async () => {
    if (!game || !myPlayer || selectedCards.length === 0) return

    // Check if cards contain wild cards and need color selection
    const hasWild = selectedCards.some(card => card.color === 'wild')
    if (hasWild && !selectedColor) {
      setPendingWildCards(selectedCards)
      setShowColorSelect(true)
      return
    }

    await executeCardPlay(selectedCards, selectedColor || null)
  }

  const executeCardPlay = async (cards: UnoCard[], chosenColor: CardColor | null) => {
    if (!game || !myPlayer) return

    try {
      // Remove cards from player's hand
      const newHand = [...myPlayer.hand]
      cards.forEach(card => {
        const index = newHand.findIndex(c => c.id === card.id)
        if (index !== -1) {
          newHand.splice(index, 1)
        }
      })

      // Update player's hand
      await supabase
        .from('players')
        .update({ hand: newHand as any })
        .eq('game_id', game.id)
        .eq('player_id', playerId)

      // Calculate effects based on card types
      const { nextPlayerIndex, newDirection, drawEffects, skipEffects } = calculateCardEffects(cards)
      
      // Handle draw card stacking
      let newPendingDrawTotal = game.pendingDrawTotal
      let newPendingDrawType = game.pendingDrawType
      let newStackingTimer = game.stackingTimer

      if (cards.some(c => c.type === 'draw2' || c.type === 'wild4')) {
        const drawCards = cards.filter(c => c.type === 'draw2' || c.type === 'wild4')
        const drawAmount = drawCards.reduce((sum, card) => {
          return sum + (card.type === 'draw2' ? 2 : 4)
        }, 0)
        
        newPendingDrawTotal += drawAmount
        newPendingDrawType = drawCards[0].type === 'draw2' ? 'draw2' : 'wild4'
        
        // Set 5-second timer for next player
        newStackingTimer = new Date(Date.now() + 5000).toISOString()
      } else if (game.pendingDrawTotal > 0) {
        // Clear pending draw if non-draw cards played
        newPendingDrawTotal = 0
        newPendingDrawType = null
        newStackingTimer = null
      }

      // Determine new color
      let newColor = chosenColor || cards[cards.length - 1].color
      if (newColor === 'wild') {
        newColor = game.currentColor // Keep current color if no choice made
      }

      // Create stacked discard pile
      const newStackedDiscard = [...cards]
      const newDiscardPile = [...game.discardPile, ...cards]

      // Create play history entry
      const newPlayHistory = [...game.playHistory, {
        player: myPlayer.name,
        action: cards.length === 1 
          ? `${cards[0].color} ${cards[0].type === 'number' ? cards[0].value : cards[0].type}`
          : `${cards.length} ${cards[0].type === 'number' ? cards[0].value : cards[0].type}s`
      }]

      // Update game state
      await supabase
        .from('games')
        .update({
          discard_pile: newDiscardPile as any,
          stacked_discard: newStackedDiscard as any,
          current_color: newColor,
          current_player_index: nextPlayerIndex,
          direction: newDirection,
          play_history: newPlayHistory as any,
          last_played_card: cards[cards.length - 1] as any,
          pending_draw_total: newPendingDrawTotal,
          pending_draw_type: newPendingDrawType,
          stacking_timer: newStackingTimer,
          selected_cards: [] as any,
          winner_id: newHand.length === 0 ? playerId : null,
          game_state: newHand.length === 0 ? 'ended' : 'playing'
        })
        .eq('id', game.id)

      // Clear selections
      setSelectedCards([])
      setSelectedColor(null)
      setPendingWildCards([])
      setShowColorSelect(false)

      // Show win message
      if (newHand.length === 0) {
        toast({
          title: "Congratulations!",
          description: "You won the game!",
        })
      }

    } catch (error) {
      console.error('Error playing cards:', error)
      toast({
        title: "Error",
        description: "Failed to play cards",
        variant: "destructive"
      })
    }
  }

  const calculateCardEffects = (cards: UnoCard[]) => {
    if (!game) return { nextPlayerIndex: 0, newDirection: 1, drawEffects: 0, skipEffects: 0 }

    let nextPlayerIndex = game.currentPlayerIndex
    let newDirection = game.direction
    let skipCount = 0

    cards.forEach(card => {
      switch (card.type) {
        case 'reverse':
          newDirection *= -1
          if (game.players.length === 2) {
            skipCount += 1 // In 2-player games, reverse acts as skip
          }
          break
        case 'skip':
          skipCount += 1
          break
        case 'draw2':
        case 'wild4':
          skipCount += 1 // Draw cards skip the target player
          break
      }
    })

    // Handle even number of reverses in non-2-player games
    if (cards.filter(c => c.type === 'reverse').length % 2 === 0 && game.players.length > 2) {
      newDirection = game.direction // Direction stays the same
      // Player gets another turn
      return { nextPlayerIndex, newDirection, drawEffects: 0, skipEffects: skipCount }
    }

    // Calculate next player with skips
    for (let i = 0; i < skipCount + 1; i++) {
      nextPlayerIndex = (nextPlayerIndex + newDirection + game.players.length) % game.players.length
    }

    return { nextPlayerIndex, newDirection, drawEffects: 0, skipEffects: skipCount }
  }

  const handleColorSelect = (color: CardColor) => {
    setSelectedColor(color)
    setShowColorSelect(false)
    
    if (pendingWildCards.length > 0) {
      executeCardPlay(pendingWildCards, color)
    }
  }

  const handleDrawTimeout = async () => {
    if (!game || !myPlayer) return

    try {
      // Force draw the pending cards
      const newHand = [...myPlayer.hand]
      const newDrawPile = [...game.drawPile]
      
      for (let i = 0; i < game.pendingDrawTotal; i++) {
        if (newDrawPile.length > 0) {
          newHand.push(newDrawPile.pop()!)
        }
      }
      
      // Update player's hand
      await supabase
        .from('players')
        .update({ hand: newHand as any })
        .eq('game_id', game.id)
        .eq('player_id', playerId)

      // Move to next player and clear pending draw
      const nextPlayerIndex = (game.currentPlayerIndex + game.direction + game.players.length) % game.players.length
      
      await supabase
        .from('games')
        .update({
          current_player_index: nextPlayerIndex,
          pending_draw_total: 0,
          pending_draw_type: null,
          stacking_timer: null,
          draw_pile: newDrawPile as any,
          play_history: [...game.playHistory, {
            player: myPlayer.name,
            action: `drew +${game.pendingDrawTotal} cards (timer expired)`
          }] as any
        })
        .eq('id', game.id)

      toast({
        title: `Drew +${game.pendingDrawTotal} cards`,
        description: "Time ran out for draw card response",
        variant: "destructive"
      })

    } catch (error) {
      console.error('Error handling draw timeout:', error)
    }
  }

  // Draw card from pile
  const drawCards = async () => {
    if (!game || !myPlayer || gameState !== 'playing') return
    
    // Check if it's the player's turn
    if (game.currentPlayerIndex !== myPlayer.position) {
      toast({
        title: "Not your turn",
        description: "Wait for your turn to draw",
        variant: "destructive"
      })
      return
    }

    try {
      const newDrawPile = [...game.drawPile]
      const newHand = [...myPlayer.hand]
      
      // If there are pending draw cards, draw all of them
      const drawAmount = game.pendingDrawTotal > 0 ? game.pendingDrawTotal : 1
      
      for (let i = 0; i < drawAmount; i++) {
        if (newDrawPile.length === 0) {
          toast({
            title: "No cards left",
            description: "The draw pile is empty",
            variant: "destructive"
          })
          return
        }
        newHand.push(newDrawPile.pop()!)
      }
      
      // Update player's hand
      await supabase
        .from('players')
        .update({ hand: newHand as any })
        .eq('game_id', game.id)
        .eq('player_id', playerId)

      // Move to next player
      const nextPlayerIndex = (game.currentPlayerIndex + game.direction + game.players.length) % game.players.length
      
      const newPlayHistory = [...game.playHistory, {
        player: myPlayer.name,
        action: drawAmount > 1 ? `drew +${drawAmount} cards` : 'drew 1 card'
      }]

      await supabase
        .from('games')
        .update({
          draw_pile: newDrawPile as any,
          current_player_index: nextPlayerIndex,
          pending_draw_total: 0,
          pending_draw_type: null,
          stacking_timer: null,
          play_history: newPlayHistory as any
        })
        .eq('id', game.id)

      // Clear timer state
      setDrawTimer(null)
      setTimerExpired(false)

    } catch (error) {
      console.error('Error drawing card:', error)
      toast({
        title: "Error",
        description: "Failed to draw card",
        variant: "destructive"
      })
    }
  }

  const createGame = async () => {
    if (!playerName.trim()) return

    try {
      const deck = shuffleDeck(generateDeck())
      const playerHand = deck.splice(0, 7)
      const discardPile = [deck.pop()!]
      const gameCode = generateInviteCode()

      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .insert({
          host_id: playerId,
          invite_code: gameCode,
          max_players: maxPlayers,
          current_player_index: 0,
          direction: 1,
          draw_pile: deck as any,
          discard_pile: discardPile as any,
          current_color: discardPile[0].color === 'wild' ? 'red' : discardPile[0].color,
          game_state: 'waiting'
        })
        .select()
        .single()

      if (gameError) throw gameError

      await supabase
        .from('players')
        .insert({
          game_id: gameData.id,
          player_id: playerId,
          name: playerName,
          hand: playerHand as any,
          position: 0,
          is_host: true
        })

      await loadGame(gameData.id)
      setGameState('waiting')
    } catch (error) {
      console.error('Error creating game:', error)
      toast({
        title: "Error",
        description: "Failed to create game",
        variant: "destructive"
      })
    }
  }

  const createGameWithBots = async () => {
    await createGame()
    // ... implement bot creation logic
  }

  const joinGame = async () => {
    if (!playerName.trim() || !inviteCode.trim()) return

    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .single()

      if (gameError) throw gameError

      const { data: existingPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameData.id)

      if (existingPlayers && existingPlayers.length >= gameData.max_players) {
        toast({
          title: "Game full",
          description: "This game is already full",
          variant: "destructive"
        })
        return
      }

      const deck = shuffleDeck(generateDeck())
      const playerHand = deck.splice(0, 7)

        await supabase
        .from('games')
        .update({
          draw_pile: [
            ...(gameData.draw_pile as unknown as UnoCard[]).slice(0, -7),
            ...deck
          ] as any
        })
        .eq('id', gameData.id)

      await supabase
        .from('players')
        .insert({
          game_id: gameData.id,
          player_id: playerId,
          name: playerName,
          hand: playerHand as any,
          position: existingPlayers?.length || 0,
          is_host: false
        })

      await loadGame(gameData.id)
      setGameState('waiting')
    } catch (error) {
      console.error('Error joining game:', error)
      toast({
        title: "Error",
        description: "Failed to join game",
        variant: "destructive"
      })
    }
  }

  const startGame = async () => {
    if (!game || game.players.length < 2) return

    await supabase
      .from('games')
      .update({ game_state: 'playing' })
      .eq('id', game.id)
  }

  const copyInviteLink = () => {
    const link = `${window.location.origin}?game=${game?.inviteCode}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({
      title: "Invite link copied!",
      description: "Share this link with other players"
    })
  }

  // Visual helper functions
  const getCardColorClasses = (card: UnoCard): string => {
    const baseClasses = "uno-card border-2 border-white"
    switch (card.color) {
      case 'red': return `${baseClasses} uno-card-red`
      case 'blue': return `${baseClasses} uno-card-blue`
      case 'green': return `${baseClasses} uno-card-green`
      case 'yellow': return `${baseClasses} uno-card-yellow`
      case 'wild': return `${baseClasses} uno-card-wild`
      default: return baseClasses
    }
  }


  const getColorIndicatorClass = (color: CardColor): string => {
    switch (color) {
      case 'red': return 'bg-red-600 text-white'
      case 'blue': return 'bg-blue-600 text-white'
      case 'green': return 'bg-green-600 text-white'
      case 'yellow': return 'bg-yellow-500 text-black'
      case 'wild': return 'bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 to-blue-500 text-white'
      default: return 'bg-gray-600 text-white'
    }
  }

  const renderCard = (card: UnoCard, index?: number, onClick?: () => void, isSmall = false, isSelected = false) => {
    const sizeClasses = isSmall ? 'w-8 h-12 text-xs' : 'w-12 h-16 sm:w-14 sm:h-20'
    const selectedClasses = isSelected ? 'ring-2 ring-blue-400 transform -translate-y-2' : ''
    const selectionNumber = selectedCards.findIndex(c => c.id === card.id) + 1
    
    return (
      <div
        key={card.id}
        className={`${getCardColorClasses(card)} ${sizeClasses} ${selectedClasses} flex items-center justify-center cursor-pointer relative transition-all duration-200`}
        onClick={onClick}
      >
        {isSelected && (
          <div className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold z-10">
            {selectionNumber}
          </div>
        )}
        
        {/* Top-left corner */}
        <div className="absolute top-1 left-1 text-white font-bold text-xs" style={{ textShadow: '1px 1px 0 black' }}>
          {card.type === 'number' ? card.value :
           card.type === 'skip' ? 'S' :
           card.type === 'reverse' ? 'R' :
           card.type === 'draw2' ? '+2' :
           card.type === 'wild' ? 'W' : '+4'}
        </div>
        
        {/* Center display */}
        <div className="text-white font-bold text-lg" style={{ textShadow: '1px 1px 0 black' }}>
          {card.type === 'number' ? card.value :
           card.type === 'skip' ? 'S' :
           card.type === 'reverse' ? 'R' :
           card.type === 'draw2' ? '+2' :
           card.type === 'wild' ? 'W' : '+4'}
        </div>
        
        {/* Bottom-right corner (rotated) */}
        <div className="absolute bottom-1 right-1 text-white font-bold text-xs rotate-180" style={{ textShadow: '1px 1px 0 black' }}>
          {card.type === 'number' ? card.value :
           card.type === 'skip' ? 'S' :
           card.type === 'reverse' ? 'R' :
           card.type === 'draw2' ? '+2' :
           card.type === 'wild' ? 'W' : '+4'}
        </div>
      </div>
    )
  }

  // Hexagon positioning for players
  const getPlayerPosition = (index: number, totalPlayers: number) => {
    const positions = {
      2: [
        { top: '10%', left: '50%', transform: 'translateX(-50%)' },
        { bottom: '10%', left: '50%', transform: 'translateX(-50%)' }
      ],
      3: [
        { top: '10%', left: '50%', transform: 'translateX(-50%)' },
        { bottom: '10%', left: '20%', transform: 'translateX(-50%)' },
        { bottom: '10%', left: '80%', transform: 'translateX(-50%)' }
      ],
      4: [
        { top: '10%', left: '50%', transform: 'translateX(-50%)' },
        { top: '50%', right: '10%', transform: 'translateY(-50%)' },
        { bottom: '10%', left: '50%', transform: 'translateX(-50%)' },
        { top: '50%', left: '10%', transform: 'translateY(-50%)' }
      ],
      5: [
        { top: '10%', left: '50%', transform: 'translateX(-50%)' },
        { top: '25%', right: '15%', transform: 'translateY(-50%)' },
        { bottom: '25%', right: '15%', transform: 'translateY(50%)' },
        { bottom: '10%', left: '50%', transform: 'translateX(-50%)' },
        { bottom: '25%', left: '15%', transform: 'translateY(50%)' }
      ],
      6: [
        { top: '10%', left: '50%', transform: 'translateX(-50%)' },
        { top: '25%', right: '10%', transform: 'translateY(-50%)' },
        { bottom: '25%', right: '10%', transform: 'translateY(50%)' },
        { bottom: '10%', left: '50%', transform: 'translateX(-50%)' },
        { bottom: '25%', left: '10%', transform: 'translateY(50%)' },
        { top: '25%', left: '10%', transform: 'translateY(-50%)' }
      ]
    }
    
    return positions[totalPlayers as keyof typeof positions]?.[index] || positions[4][index % 4]
  }

  // Main game screen
  if (!game) return null

  const currentPlayer = game.players[game.currentPlayerIndex]
  const myPlayer = game.players.find(p => p.id === playerId)
  const topCard = game.discardPile[game.discardPile.length - 1]
  const actualColor = topCard?.color === 'wild' ? game.currentColor : topCard?.color
  const lastMove = game.playHistory[game.playHistory.length - 1]

  // Create placeholder players for empty slots
  const allSlots = []
  for (let i = 0; i < game.maxPlayers; i++) {
    const existingPlayer = game.players.find(p => p.position === i)
    if (existingPlayer) {
      allSlots.push(existingPlayer)
    } else {
      allSlots.push({
        id: `placeholder-${i}`,
        name: `Player ${i + 1}`,
        hand: [],
        position: i,
        isHost: false
      })
    }
  }

  // Show appropriate UI based on game state
  if (gameState === 'lobby') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-white">UNO</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="playerName" className="text-white">Your Name</Label>
              <Input
                id="playerName"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="bg-gray-700 border-gray-600 text-white"
              />
            </div>
            
            <div>
              <Label htmlFor="maxPlayers" className="text-white">Number of Players</Label>
              <Select value={maxPlayers.toString()} onValueChange={(v) => setMaxPlayers(parseInt(v))}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  <SelectItem value="2" className="text-white">2 Players</SelectItem>
                  <SelectItem value="3" className="text-white">3 Players</SelectItem>
                  <SelectItem value="4" className="text-white">4 Players</SelectItem>
                  <SelectItem value="5" className="text-white">5 Players</SelectItem>
                  <SelectItem value="6" className="text-white">6 Players</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={createGame} className="w-full" disabled={!playerName.trim()}>
              Create Game
            </Button>
            
            <Button onClick={() => createGameWithBots()} className="w-full" disabled={!playerName.trim()} variant="outline">
              Play with Bots
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (gameState === 'joining') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-white">Join Game</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="playerName" className="text-white">Your Name</Label>
              <Input
                id="playerName"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="bg-gray-700 border-gray-600 text-white"
              />
            </div>
            
            <div>
              <Label className="text-white">Game Code: {inviteCode}</Label>
            </div>

            <Button onClick={joinGame} className="w-full" disabled={!playerName.trim()}>
              Join Game
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (gameState === 'ended') {
    const winner = game.players.find(p => p.id === game.winnerId)
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        {winner && <Confetti />}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <Card className="bg-gray-800 border-gray-700 text-center p-6">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Trophy className="w-8 h-8 text-yellow-400" />
              <h2 className="text-2xl font-bold text-white">Game Over!</h2>
            </div>
            <p className="text-xl text-white mb-4">
              {winner?.name} wins!
            </p>
            <Button onClick={() => setGameState('lobby')} className="w-full">
              Play Again
            </Button>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Top bar - compressed for mobile */}
      <div className="flex justify-between items-center p-1 sm:p-2">
        <div className="bg-gray-800 rounded-lg p-1 sm:p-2 shadow-lg">
          {gameState === 'waiting' ? (
            <div className="text-white">
              <div className="text-xs sm:text-sm font-bold">Waiting for players...</div>
              <div className="text-xs">{game.players.length}/{game.maxPlayers} players</div>
            </div>
          ) : (
            <div className="text-left">
              <div className="flex items-center space-x-1 sm:space-x-2">
                <span className="text-xs sm:text-sm font-bold text-white">Turn: {currentPlayer?.name}</span>
                <div className={`px-1 sm:px-2 py-1 rounded text-xs ${getColorIndicatorClass(actualColor!)}`}>
                  {actualColor?.toUpperCase()}
                </div>
                <div className="flex items-center">
                  {game.direction === 1 ? (
                    <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                  ) : (
                    <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                  )}
                </div>
              </div>
              {lastMove && (
                <div className="text-xs text-gray-400">
                  {lastMove.player}: {lastMove.action}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timer and actions */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {drawTimer && (
            <div className="bg-red-600 text-white px-2 py-1 rounded-lg flex items-center space-x-1">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-bold">{drawTimer}s</span>
            </div>
          )}
          
          {game.pendingDrawTotal > 0 && (
            <div className="bg-orange-600 text-white px-2 py-1 rounded-lg text-sm font-bold">
              +{game.pendingDrawTotal}
            </div>
          )}

          <Button onClick={() => setShowHistory(!showHistory)} variant="outline" size="sm">
            <History className="w-4 h-4" />
          </Button>
          
          {gameState === 'waiting' && myPlayer?.isHost && (
            <Button onClick={startGame} size="sm" disabled={game.players.length < 2}>
              Start Game
            </Button>
          )}
          
          {gameState === 'waiting' && (
            <Button onClick={copyInviteLink} variant="outline" size="sm">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Game area - relative positioning for mobile */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {/* Player positions */}
        {allSlots.map((player, index) => {
          const position = getPlayerPosition(player.position, game.maxPlayers)
          const isMyPosition = player.id === playerId
          const isCurrentPlayer = player.position === game.currentPlayerIndex
          const actualPlayer = game.players.find(p => p.position === player.position)
          
          return (
            <div
              key={player.id}
              className="absolute"
              style={position}
            >
              <div className={`bg-gray-800 rounded-lg p-1 sm:p-2 shadow-lg text-center min-w-[60px] sm:min-w-[80px] ${
                isCurrentPlayer ? 'ring-2 ring-blue-400' : ''
              }`}>
                <div className="text-white text-xs sm:text-sm font-bold">
                  {actualPlayer ? actualPlayer.name : 'Empty'}
                </div>
                {actualPlayer && (
                  <div className="text-gray-400 text-xs">
                    {actualPlayer.hand.length} cards
                  </div>
                )}
                {isMyPosition && actualPlayer && (
                  <button
                    onClick={() => setExpandedHand(!expandedHand)}
                    className="mt-1 p-1 bg-gray-700 rounded text-white hover:bg-gray-600"
                  >
                    {expandedHand ? <ZoomOut className="w-3 h-3" /> : <ZoomIn className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* Center play area */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center space-x-2 sm:space-x-4">
          {/* Draw pile */}
          <div 
            className={`relative ${timerExpired ? 'ring-2 ring-red-500 animate-pulse' : ''}`}
            onClick={drawCards}
          >
            <div className="w-12 h-16 sm:w-14 sm:h-20 bg-gray-600 border-2 border-white rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-500">
              <span className="text-white font-bold text-xs sm:text-sm" style={{ textShadow: '1px 1px 0 black' }}>
                DRAW
              </span>
            </div>
          </div>

          {/* Discard pile */}
          <div className={`relative ${selectedCards.length > 0 ? 'ring-2 ring-green-400 animate-pulse' : ''}`}>
            {game.stackedDiscard.length > 0 ? (
              // Show stacked cards
              <div className="relative">
                {game.stackedDiscard.slice(-3).map((card, index) => (
                  <div 
                    key={`stacked-${index}`}
                    className="absolute"
                    style={{ 
                      zIndex: index,
                      transform: `translate(${index * 2}px, ${index * -2}px)`
                    }}
                    onClick={selectedCards.length > 0 ? playSelectedCards : undefined}
                  >
                    {renderCard(card)}
                  </div>
                ))}
              </div>
            ) : topCard ? (
              <div onClick={selectedCards.length > 0 ? playSelectedCards : undefined}>
                {renderCard(topCard)}
              </div>
            ) : (
              <div className="w-12 h-16 sm:w-14 sm:h-20 bg-gray-600 border-2 border-white rounded-lg"></div>
            )}
          </div>
        </div>

        {/* Player hand */}
        {myPlayer && (
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
            {expandedHand ? (
              <div className="bg-gray-800 p-4 rounded-lg max-w-screen-sm">
                <div className="grid grid-cols-7 gap-2 max-h-64 overflow-y-auto">
                  {myPlayer.hand.map((card, index) => {
                    const isSelected = selectedCards.some(c => c.id === card.id)
                    const canPlay = canPlayCard(card)
                    const isDisabled = game.pendingDrawTotal > 0 && !canPlayDrawCard(card)
                    
                    return (
                      <div
                        key={card.id}
                        className={`${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={() => !isDisabled && selectCard(card, index)}
                      >
                        {renderCard(card, index, undefined, false, isSelected)}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex space-x-1 max-w-screen-sm overflow-x-auto pb-2">
                {myPlayer.hand.map((card, index) => {
                  const isSelected = selectedCards.some(c => c.id === card.id)
                  const canPlay = canPlayCard(card)
                  const isDisabled = game.pendingDrawTotal > 0 && !canPlayDrawCard(card)
                  
                  return (
                    <div
                      key={card.id}
                      className={`${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} flex-shrink-0`}
                      onClick={() => !isDisabled && selectCard(card, index)}
                    >
                      {renderCard(card, index, undefined, false, isSelected)}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showColorSelect && (
        <ColorSelectModal
          onColorSelect={handleColorSelect}
          onClose={() => setShowColorSelect(false)}
        />
      )}

      {/* Game History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-4 max-w-md w-full max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Game History</h3>
              <Button onClick={() => setShowHistory(false)} variant="outline" size="sm">
                Close
              </Button>
            </div>
            <div className="space-y-2">
              {game.playHistory.map((move, index) => (
                <div key={index} className="text-sm text-gray-300 bg-gray-700 p-2 rounded">
                  <strong>{move.player}:</strong> {move.action}
                </div>
              ))}
              {game.playHistory.length === 0 && (
                <div className="text-gray-400 text-center">No moves yet</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
