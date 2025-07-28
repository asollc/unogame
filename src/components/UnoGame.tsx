import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, ArrowRight, Trophy, History, Copy, Check } from 'lucide-react'
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
  const { toast } = useToast()

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
    const { data: gameData } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()

    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .order('position')

    if (gameData && playersData) {
      const loadedGame: Game = {
        id: gameData.id,
        hostId: gameData.host_id,
        inviteCode: gameData.invite_code,
        maxPlayers: gameData.max_players,
        currentPlayerIndex: gameData.current_player_index,
        direction: gameData.direction as 1 | -1,
        drawPile: JSON.parse(JSON.stringify(gameData.draw_pile)) as UnoCard[],
        discardPile: JSON.parse(JSON.stringify(gameData.discard_pile)) as UnoCard[],
        currentColor: gameData.current_color as CardColor,
        drawCount: gameData.draw_count,
        pendingWildCard: gameData.pending_wild_card ? JSON.parse(JSON.stringify(gameData.pending_wild_card)) as UnoCard : undefined,
        lastPlayedCard: gameData.last_played_card ? JSON.parse(JSON.stringify(gameData.last_played_card)) as UnoCard : undefined,
        playHistory: JSON.parse(JSON.stringify(gameData.play_history)) as { player: string; action: string }[],
        gameState: gameData.game_state,
        winnerId: gameData.winner_id,
        players: playersData.map(p => ({
          id: p.player_id,
          name: p.name,
          hand: JSON.parse(JSON.stringify(p.hand)) as UnoCard[],
          position: p.position,
          isHost: p.is_host
        }))
      }
      setGame(loadedGame)
      
      if (loadedGame.gameState === 'playing') {
        setGameState('playing')
      } else if (loadedGame.gameState === 'ended') {
        setGameState('ended')
      } else {
        setGameState('waiting')
      }
    }
  }

  const createGame = async () => {
    if (!playerName.trim()) return

    const deck = shuffleDeck(generateDeck())
    const inviteCode = generateInviteCode()
    
    // Deal 7 cards for host
    const hostHand = deck.splice(0, 7)
    
    // First card on discard pile
    let firstCard = deck.pop()!
    while (firstCard.type === 'wild4') {
      deck.push(firstCard)
      deck.sort(() => Math.random() - 0.5)
      firstCard = deck.pop()!
    }

    const gameInsert = {
      host_id: playerId,
      invite_code: inviteCode,
      max_players: maxPlayers,
      draw_pile: deck as any,
      discard_pile: [firstCard] as any,
      current_color: firstCard.color === 'wild' ? 'red' : firstCard.color,
      play_history: [{ player: 'Game Start', action: `${firstCard.color} ${firstCard.type === 'number' ? firstCard.value : firstCard.type}` }] as any
    }
    
    const { data: gameData, error } = await supabase
      .from('games')
      .insert(gameInsert)
      .select()
      .single()

    if (error) {
      toast({
        title: "Error creating game",
        description: error.message,
        variant: "destructive"
      })
      return
    }

    // Add host as player
    await supabase
      .from('players')
      .insert({
        game_id: gameData.id,
        player_id: playerId,
        name: playerName,
        hand: hostHand as any,
        position: 0,
        is_host: true
      })

    await loadGame(gameData.id)
    setGameState('waiting')
  }

  const createGameWithBots = async () => {
    if (!playerName.trim()) return

    const deck = shuffleDeck(generateDeck())
    const inviteCode = generateInviteCode()
    
    // Deal cards for all players (human + bots)
    const allHands: UnoCard[][] = []
    for (let i = 0; i < maxPlayers; i++) {
      allHands.push(deck.splice(0, 7))
    }
    
    // First card on discard pile
    let firstCard = deck.pop()!
    while (firstCard.type === 'wild4') {
      deck.push(firstCard)
      deck.sort(() => Math.random() - 0.5)
      firstCard = deck.pop()!
    }

    const gameInsert = {
      host_id: playerId,
      invite_code: inviteCode,
      max_players: maxPlayers,
      draw_pile: deck as any,
      discard_pile: [firstCard] as any,
      current_color: firstCard.color === 'wild' ? 'red' : firstCard.color,
      game_state: 'playing',
      play_history: [{ player: 'Game Start', action: `${firstCard.color} ${firstCard.type === 'number' ? firstCard.value : firstCard.type}` }] as any
    }
    
    const { data: gameData, error } = await supabase
      .from('games')
      .insert(gameInsert)
      .select()
      .single()

    if (error) {
      toast({
        title: "Error creating game",
        description: error.message,
        variant: "destructive"
      })
      return
    }

    // Add human player
    await supabase
      .from('players')
      .insert({
        game_id: gameData.id,
        player_id: playerId,
        name: playerName,
        hand: allHands[0] as any,
        position: 0,
        is_host: true
      })

    // Add bot players
    for (let i = 1; i < maxPlayers; i++) {
      await supabase
        .from('players')
        .insert({
          game_id: gameData.id,
          player_id: `bot-${i}`,
          name: `Bot ${i}`,
          hand: allHands[i] as any,
          position: i,
          is_host: false
        })
    }

    await loadGame(gameData.id)
    setGameState('playing')
  }

  const joinGame = async () => {
    if (!playerName.trim() || !inviteCode) return

    const { data: gameData } = await supabase
      .from('games')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase())
      .single()

    if (!gameData) {
      toast({
        title: "Game not found",
        description: "Please check the invite code",
        variant: "destructive"
      })
      return
    }

    const { data: existingPlayers } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameData.id)

    if (!existingPlayers || existingPlayers.length >= gameData.max_players) {
      toast({
        title: "Game is full",
        description: "This game has reached maximum players",
        variant: "destructive"
      })
      return
    }

    // Deal 7 cards to new player
    const deck = [...JSON.parse(JSON.stringify(gameData.draw_pile)) as UnoCard[]]
    const playerHand = deck.splice(0, 7)
    
    // Update draw pile
    await supabase
      .from('games')
      .update({ 
        draw_pile: deck as any,
        play_history: [
          ...(gameData.play_history as any[]),
          { player: playerName, action: 'Joined the game' }
        ] as any
      })
      .eq('id', gameData.id)

    // Add new player
    await supabase
      .from('players')
      .insert({
        game_id: gameData.id,
        player_id: playerId,
        name: playerName,
        hand: playerHand as any,
        position: existingPlayers.length,
        is_host: false
      })

    await loadGame(gameData.id)
    setGameState('waiting')
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

  // Check if a card can be played
  const canPlayCard = (card: UnoCard): boolean => {
    if (!topCard || !game) return false
    
    // Wild cards can always be played
    if (card.color === 'wild') return true
    
    // Card matches color or type/value
    return card.color === game.currentColor || 
           (card.type === topCard.type && card.type !== 'wild') ||
           (card.type === 'number' && topCard.type === 'number' && card.value === topCard.value)
  }

  // Play a card
  const playCard = async (card: UnoCard, cardIndex: number) => {
    if (!game || !myPlayer || gameState !== 'playing') return
    
    // Check if it's the player's turn
    if (game.currentPlayerIndex !== myPlayer.position) {
      toast({
        title: "Not your turn",
        description: "Wait for your turn to play",
        variant: "destructive"
      })
      return
    }

    // Check if card can be played
    if (!canPlayCard(card)) {
      toast({
        title: "Invalid card",
        description: "This card cannot be played",
        variant: "destructive"
      })
      return
    }

    try {
      // Remove card from player's hand
      const newHand = [...myPlayer.hand]
      newHand.splice(cardIndex, 1)

      // Update player's hand
      await supabase
        .from('players')
        .update({ hand: newHand as any })
        .eq('game_id', game.id)
        .eq('player_id', playerId)

      // Handle wild cards
      let newColor = card.color
      if (card.color === 'wild') {
        // For now, automatically choose red (could be enhanced with color picker)
        newColor = 'red'
      }

      // Calculate next player index
      let nextPlayerIndex = game.currentPlayerIndex
      let direction = game.direction

      // Handle special cards
      if (card.type === 'reverse') {
        direction = direction * -1
      }
      
      if (card.type === 'skip' || card.type === 'draw2') {
        // Skip next player
        nextPlayerIndex = (nextPlayerIndex + direction + game.players.length) % game.players.length
      }
      
      // Move to next player
      nextPlayerIndex = (nextPlayerIndex + direction + game.players.length) % game.players.length

      // Handle draw cards
      if (card.type === 'draw2' || card.type === 'wild4') {
        const drawCount = card.type === 'draw2' ? 2 : 4
        const targetPlayerIndex = (game.currentPlayerIndex + game.direction + game.players.length) % game.players.length
        const targetPlayer = game.players[targetPlayerIndex]
        
        if (targetPlayer) {
          const targetHand = [...targetPlayer.hand]
          const newDrawPile = [...game.drawPile]
          
          // Draw cards for target player
          for (let i = 0; i < drawCount; i++) {
            if (newDrawPile.length > 0) {
              targetHand.push(newDrawPile.pop()!)
            }
          }
          
          // Update target player's hand
          await supabase
            .from('players')
            .update({ hand: targetHand as any })
            .eq('game_id', game.id)
            .eq('player_id', targetPlayer.id)
        }
      }

      // Update game state
      const newDiscardPile = [...game.discardPile, card]
      const newPlayHistory = [...game.playHistory, {
        player: myPlayer.name,
        action: `${card.color} ${card.type === 'number' ? card.value : card.type}`
      }]

      await supabase
        .from('games')
        .update({
          discard_pile: newDiscardPile as any,
          current_color: newColor,
          current_player_index: nextPlayerIndex,
          direction: direction,
          play_history: newPlayHistory as any,
          last_played_card: card as any,
          winner_id: newHand.length === 0 ? playerId : null,
          game_state: newHand.length === 0 ? 'ended' : 'playing'
        })
        .eq('id', game.id)

      // Show win message
      if (newHand.length === 0) {
        toast({
          title: "Congratulations!",
          description: "You won the game!",
        })
      }

    } catch (error) {
      console.error('Error playing card:', error)
      toast({
        title: "Error",
        description: "Failed to play card",
        variant: "destructive"
      })
    }
  }

  // Draw card
  const drawCard = async () => {
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
      
      if (newDrawPile.length === 0) {
        toast({
          title: "No cards left",
          description: "The draw pile is empty",
          variant: "destructive"
        })
        return
      }

      // Draw a card
      const drawnCard = newDrawPile.pop()!
      newHand.push(drawnCard)

      // Update player's hand
      await supabase
        .from('players')
        .update({ hand: newHand as any })
        .eq('game_id', game.id)
        .eq('player_id', playerId)

      // Move to next player
      const nextPlayerIndex = (game.currentPlayerIndex + game.direction + game.players.length) % game.players.length

      // Update game state
      await supabase
        .from('games')
        .update({
          draw_pile: newDrawPile as any,
          current_player_index: nextPlayerIndex,
          draw_count: game.drawCount + 1
        })
        .eq('id', game.id)

    } catch (error) {
      console.error('Error drawing card:', error)
      toast({
        title: "Error",
        description: "Failed to draw card",
        variant: "destructive"
      })
    }
  }

  // Get card color classes
  const getCardColorClasses = (color: CardColor) => {
    switch (color) {
      case 'red': return 'bg-red-600'
      case 'blue': return 'bg-blue-600'
      case 'green': return 'bg-green-600'
      case 'yellow': return 'bg-yellow-400 text-black'
      case 'wild': return 'bg-gradient-to-br from-red-600 via-yellow-400 to-blue-600'
    }
  }

  // Get color indicator class
  const getColorIndicatorClass = (color: CardColor) => {
    switch (color) {
      case 'red': return 'bg-red-600 text-white'
      case 'blue': return 'bg-blue-600 text-white'
      case 'green': return 'bg-green-600 text-white'
      case 'yellow': return 'bg-yellow-400 text-black'
      case 'wild': return 'bg-gray-600 text-white'
    }
  }

  // Render card
  const renderCard = (card: UnoCard, index?: number, onClick?: () => void, isSmall = false) => {
    const size = isSmall ? 'w-10 h-14' : 'w-12 h-16 sm:w-14 sm:h-20'
    const textSize = isSmall ? 'text-[10px]' : 'text-xs sm:text-base'
    const cornerSize = isSmall ? 'text-[8px]' : 'text-[10px] sm:text-xs'
    
    // Check if card is playable
    const isPlayable = onClick && canPlayCard(card)
    const isMyTurn = game && myPlayer && game.currentPlayerIndex === myPlayer.position
    
    return (
      <div
        key={card.id}
        className={`${size} rounded border border-black flex flex-col justify-between p-0.5 transition-all duration-200 ${getCardColorClasses(card.color)} relative shadow-lg ${
          onClick ? (isPlayable && isMyTurn ? 'cursor-pointer hover:scale-105 hover:shadow-xl ring-2 ring-yellow-400' : 'cursor-not-allowed opacity-60') : 'cursor-default'
        }`}
        onClick={onClick && isPlayable && isMyTurn ? onClick : undefined}
      >
        <div className={`absolute top-0.5 left-0.5 ${cornerSize} font-bold text-white`}>
          {card.type === 'number' ? card.value : 
           card.type === 'skip' ? 'S' :
           card.type === 'reverse' ? 'R' :
           card.type === 'draw2' ? '+2' :
           card.type === 'wild' ? 'W' : '+4'}
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          <span className={`${textSize} font-bold text-white`}>
            {card.type === 'number' ? card.value : 
             card.type === 'skip' ? 'SKIP' :
             card.type === 'reverse' ? '↺' :
             card.type === 'draw2' ? '+2' :
             card.type === 'wild' ? 'WILD' : '+4'}
          </span>
        </div>
        
        <div className={`absolute bottom-0.5 right-0.5 ${cornerSize} font-bold text-white`}>
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

  // Lobby screen
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

  // Joining screen
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

  // Game ended screen
  if (gameState === 'ended' && game) {
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

  // Waiting room or game screen
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

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Top bar */}
      <div className="flex justify-between items-center p-2 sm:p-4">
        <div className="bg-gray-800 rounded-lg p-2 shadow-lg">
          {gameState === 'waiting' ? (
            <div className="text-white">
              <div className="text-sm font-bold">Waiting for players...</div>
              <div className="text-xs">{game.players.length}/{game.maxPlayers} players</div>
            </div>
          ) : (
            <div className="text-left">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-white">Turn: {currentPlayer?.name}</span>
                <div className={`px-2 py-1 rounded text-xs ${getColorIndicatorClass(actualColor!)}`}>
                  {actualColor?.toUpperCase()}
                </div>
                <div className="flex items-center">
                  {game.direction === 1 ? (
                    <ArrowLeft className="w-4 h-4 text-white" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-white" />
                  )}
                </div>
              </div>
              {lastMove && (
                <div className="text-xs text-white mt-1">
                  Last: {lastMove.player} - {lastMove.action}
                </div>
              )}
            </div>
          )}
        </div>

        {gameState === 'waiting' && game.hostId === playerId && (
          <div className="bg-gray-800 rounded-lg p-2 shadow-lg">
            <div className="flex items-center space-x-2 mb-2">
              <div className="text-xs text-white cursor-pointer" onClick={copyInviteLink}>
                {window.location.origin}?game={game.inviteCode}
              </div>
              <Button
                onClick={copyInviteLink}
                variant="ghost"
                size="sm"
                className="p-1 h-6 w-6"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
            {game.players.length >= 2 && (
              <Button onClick={startGame} size="sm">
                Start Game
              </Button>
            )}
          </div>
        )}

        {gameState === 'playing' && (
          <div className="bg-gray-800 rounded-lg p-2 shadow-lg">
            <Button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center space-x-1 text-white text-xs px-2 py-1"
              variant="ghost"
            >
              <History className="w-3 h-3" />
              <span>History</span>
            </Button>
          </div>
        )}
      </div>

      {/* Game area */}
      <div className="flex-1 relative">
        {/* Center area with deck and discard pile */}
        {topCard && (gameState === 'playing' || gameState === 'waiting') && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center space-x-4">
            <div className="text-center">
              <div className="w-12 h-16 sm:w-14 sm:h-20 bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl flex items-center justify-center text-white font-bold shadow-lg border-2 border-dashed border-gray-600">
                <div className="text-center">
                  <div className="text-sm">{game.drawPile.length}</div>
                  <div className="text-[10px]">Cards</div>
                </div>
              </div>
              <Button 
                className="mt-1 text-[10px] px-2 py-1" 
                onClick={drawCard}
                disabled={!game || !myPlayer || gameState !== 'playing' || game.currentPlayerIndex !== myPlayer.position}
              >
                Draw
              </Button>
            </div>
            <div>
              {renderCard(topCard)}
            </div>
          </div>
        )}

        {/* Player positions */}
        {allSlots.map((player, index) => {
          const position = getPlayerPosition(index, game.maxPlayers)
          const isCurrentPlayer = player.id === currentPlayer?.id
          const isPlaceholder = player.id.startsWith('placeholder')
          
          return (
            <div
              key={player.id}
              className="absolute"
              style={position}
            >
              <div className={`bg-gray-800 rounded-lg p-2 shadow-lg ${isCurrentPlayer ? 'border-2 border-lime-400' : ''} ${isPlaceholder ? 'opacity-50' : ''}`}>
                <div className="text-xs font-bold text-white text-center mb-1">{player.name}</div>
                
                <div className="flex justify-center">
                  {Array.from({ length: Math.min(player.hand.length || 5, 5) }).map((_, i) => (
                    <div key={i} className="w-2 h-3 bg-gray-600 rounded-sm -ml-0.5 border border-gray-500" />
                  ))}
                  {(player.hand.length || 0) > 5 && (
                    <span className="text-[8px] ml-0.5 text-gray-300">+{player.hand.length - 5}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* My hand */}
      {myPlayer && (gameState === 'playing' || gameState === 'waiting') && (
        <div className="mt-2 sm:mt-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="py-2 sm:py-3">
              <CardTitle className="text-center text-white text-sm sm:text-base">{myPlayer.name}</CardTitle>
            </CardHeader>
            <CardContent className="py-2 sm:py-3">
              <div className="flex flex-wrap gap-1 sm:gap-2 justify-center overflow-x-auto max-w-full">
                <div className={`flex gap-1 sm:gap-2 ${myPlayer.hand.length > 7 ? 'min-w-max' : ''}`}>
                  {myPlayer.hand.map((card, index) => (
                    <div key={`${card.id}-${index}`} className="flex-shrink-0">
                      {renderCard(card, index, () => playCard(card, index))}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Game history modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-gray-800 border-gray-700 max-h-96">
            <CardHeader className="py-3">
              <CardTitle className="text-xl font-bold text-center text-white">Game History</CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="space-y-1 overflow-y-auto max-h-64">
                {game.playHistory.slice().reverse().map((entry, index) => (
                  <div key={index} className="text-xs text-white">
                    <span className="font-bold">{entry.player}:</span> {entry.action}
                  </div>
                ))}
              </div>
              <Button onClick={() => setShowHistory(false)} className="w-full mt-3">
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}