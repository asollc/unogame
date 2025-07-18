import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, ArrowRight } from 'lucide-react'

// Types
type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild'
type CardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'
type GameState = 'lobby' | 'playing' | 'ended' | 'color-select'

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
  isBot: boolean
  isHuman: boolean
  position: number // 0: bottom (human), 1: left, 2: top, 3: right
  turnOrder: number // 0: human, 1: next player, etc.
}

interface Game {
  id: string
  players: Player[]
  currentPlayerIndex: number
  direction: 1 | -1
  drawPile: UnoCard[]
  discardPile: UnoCard[]
  currentColor: CardColor
  drawCount: number
  pendingWildCard?: UnoCard
  lastPlayedCard?: UnoCard
  playHistory: { player: string; action: string }[]
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

export default function UnoGame() {
  const [gameState, setGameState] = useState<GameState>('lobby')
  const [game, setGame] = useState<Game | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [botCount, setBotCount] = useState(2)
  const [inviteLink, setInviteLink] = useState('')
  const [winner, setWinner] = useState<Player | null>(null)
  const [gameId, setGameId] = useState('')
  const [showUno, setShowUno] = useState(false)
  const [showFullLog, setShowFullLog] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Initialize game
  const initializeGame = useCallback((playerNames: string[]) => {
    const deck = shuffleDeck(generateDeck())
    const players: Player[] = playerNames.map((name, index) => ({
      id: `player-${index}`,
      name,
      hand: [],
      isBot: index > 0 && playerNames.length > 1,
      isHuman: index === 0,
      position: 0,
      turnOrder: index
    }))

    // Set positions based on turn order for clockwise play
    // Position 0: bottom (human), 1: left, 2: top, 3: right
    players[0].position = 0 // Human always at bottom
    
    if (players.length === 2) {
      players[1].position = 2 // Bot at top
    } else if (players.length === 3) {
      players[1].position = 1 // Bot 1 at left
      players[2].position = 3 // Bot 2 at right
    } else if (players.length >= 4) {
      players[1].position = 1 // Bot 1 at left
      players[2].position = 2 // Bot 2 at top
      players[3].position = 3 // Bot 3 at right
    }

    // Deal 7 cards to each player
    players.forEach(player => {
      for (let i = 0; i < 7; i++) {
        player.hand.push(deck.pop()!)
      }
    })

    // First card on discard pile
    let firstCard = deck.pop()!
    while (firstCard.type === 'wild4') {
      deck.push(firstCard)
      deck.sort(() => Math.random() - 0.5)
      firstCard = deck.pop()!
    }

    const newGame: Game = {
      id: Math.random().toString(36).substring(7),
      players,
      currentPlayerIndex: 0,
      direction: 1, // Always start clockwise
      drawPile: deck,
      discardPile: [firstCard],
      currentColor: firstCard.color === 'wild' ? 'red' : firstCard.color,
      drawCount: 0,
      playHistory: [{ player: 'Game Start', action: `${firstCard.color} ${firstCard.type === 'number' ? firstCard.value : firstCard.type}` }]
    }

    setGame(newGame)
    setGameId(newGame.id)
    setGameState('playing')
    setInviteLink(`${window.location.origin}?game=${newGame.id}`)
  }, [])

  // Check for UNO
  const checkUno = (player: Player) => {
    if (player.hand.length === 1) {
      setShowUno(true)
      setTimeout(() => setShowUno(false), 2000)
      return true
    }
    return false
  }

  // Show error message
  const showError = (message: string) => {
    setErrorMessage(message)
    setTimeout(() => setErrorMessage(null), 1500)
  }

  // Bot AI with 1.5 second delay
  const botPlay = useCallback((game: Game): Game => {
    const currentPlayer = game.players[game.currentPlayerIndex]
    if (!currentPlayer.isBot) return game

    const playableCards = currentPlayer.hand.filter(card => {
      if (card.color === 'wild') return true
      if (card.color === game.currentColor) return true
      if (card.type === 'number' && card.value === game.discardPile[game.discardPile.length - 1].value) return true
      if (card.type === game.discardPile[game.discardPile.length - 1].type && card.type !== 'number') return true
      return false
    })

    let newGame = { ...game }

    // Handle draw cards for bots
    if (newGame.drawCount > 0) {
      const cardsToDraw = newGame.drawCount
      for (let i = 0; i < cardsToDraw; i++) {
        if (newGame.drawPile.length === 0) {
          const lastCard = newGame.discardPile.pop()!
          newGame.drawPile = shuffleDeck(newGame.discardPile)
          newGame.discardPile = [lastCard]
        }
        currentPlayer.hand.push(newGame.drawPile.pop()!)
      }
      newGame.drawCount = 0
      newGame.playHistory.push({ player: currentPlayer.name, action: `Drew ${cardsToDraw} cards` })
      
      // Skip the bot's turn after drawing
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      return newGame
    }

    if (playableCards.length > 0) {
      // Play a random playable card
      const cardToPlay = playableCards[Math.floor(Math.random() * playableCards.length)]
      const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardToPlay.id)
      
      currentPlayer.hand.splice(cardIndex, 1)
      newGame.discardPile.push(cardToPlay)
      newGame.lastPlayedCard = cardToPlay

      let action = ''
      if (cardToPlay.type === 'wild' || cardToPlay.type === 'wild4') {
        const selectedColor = colors[Math.floor(Math.random() * colors.length)]
        newGame.currentColor = selectedColor
        action = cardToPlay.type === 'wild' ? `Wild-${selectedColor}` : `Wild Draw4-${selectedColor}`
      } else {
        newGame.currentColor = cardToPlay.color
        action = cardToPlay.type === 'number' ? `${cardToPlay.color} ${cardToPlay.value}` : `${cardToPlay.color} ${cardToPlay.type}`
      }

      newGame.playHistory.push({ player: currentPlayer.name, action })

      if (checkUno(currentPlayer)) {
        newGame.playHistory.push({ player: currentPlayer.name, action: 'UNO!' })
      }

      if (currentPlayer.hand.length === 0) {
        setWinner(currentPlayer)
        setGameState('ended')
        return newGame
      }

      // Handle special cards
      if (cardToPlay.type === 'skip') {
        newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
        newGame.playHistory.push({ player: game.players[newGame.currentPlayerIndex].name, action: 'Skipped' })
        newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      } else if (cardToPlay.type === 'reverse') {
        newGame.direction *= -1
        if (newGame.players.length === 2) {
          newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
        }
        newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      } else if (cardToPlay.type === 'draw2') {
        newGame.drawCount += 2
        newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      } else if (cardToPlay.type === 'wild4') {
        newGame.drawCount += 4
        newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      } else {
        newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      }
    } else {
      // Draw one card
      if (newGame.drawPile.length === 0) {
        const lastCard = newGame.discardPile.pop()!
        newGame.drawPile = shuffleDeck(newGame.discardPile)
        newGame.discardPile = [lastCard]
      }
      currentPlayer.hand.push(newGame.drawPile.pop()!)
      newGame.playHistory.push({ player: currentPlayer.name, action: 'Drew 1 card' })
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
    }

    return newGame
  }, [])

  // Handle color selection for wild cards
  const handleColorSelection = (color: CardColor) => {
    if (!game || !game.pendingWildCard) return

    const newGame = { ...game }
    
    newGame.currentColor = color
    if (newGame.pendingWildCard.type === 'wild4') {
      newGame.drawCount += 4
    }
    
    const action = newGame.pendingWildCard.type === 'wild' ? `Wild-${color}` : `Wild Draw4-${color}`
    newGame.playHistory.push({ player: newGame.players[newGame.currentPlayerIndex].name, action })

    if (newGame.players[newGame.currentPlayerIndex].hand.length === 1) {
      newGame.playHistory.push({ player: newGame.players[newGame.currentPlayerIndex].name, action: 'UNO!' })
    }
    
    newGame.pendingWildCard = undefined
    newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
    
    setGame(newGame)
    setGameState('playing')
  }

  // Handle card play
  const playCard = (cardIndex: number) => {
    if (!game || gameState !== 'playing') return
    
    const currentPlayer = game.players[game.currentPlayerIndex]
    if (!currentPlayer.isHuman) return

    // Handle draw cards for humans
    if (game.drawCount > 0) {
      const cardsToDraw = game.drawCount
      const newGame = { ...game }
      
      for (let i = 0; i < cardsToDraw; i++) {
        if (newGame.drawPile.length === 0) {
          const lastCard = newGame.discardPile.pop()!
          newGame.drawPile = shuffleDeck(newGame.discardPile)
          newGame.discardPile = [lastCard]
        }
        currentPlayer.hand.push(newGame.drawPile.pop()!)
      }
      
      newGame.drawCount = 0
      newGame.playHistory.push({ player: currentPlayer.name, action: `Drew ${cardsToDraw} cards` })
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      setGame(newGame)
      return
    }

    const card = currentPlayer.hand[cardIndex]
    const topCard = game.discardPile[game.discardPile.length - 1]

    // Check if card is playable
    let isPlayable = false
    if (card.color === 'wild') {
      isPlayable = true
    } else if (card.color === game.currentColor) {
      isPlayable = true
    } else if (card.type === 'number' && card.value === topCard.value) {
      isPlayable = true
    } else if (card.type === topCard.type && card.type !== 'number') {
      isPlayable = true
    }

    if (!isPlayable) {
      showError("Can't play that card!")
      return
    }

    const newGame = { ...game }
    const playedCard = currentPlayer.hand.splice(cardIndex, 1)[0]
    newGame.discardPile.push(playedCard)
    newGame.lastPlayedCard = playedCard

    let action = ''
    if (playedCard.type === 'wild' || playedCard.type === 'wild4') {
      newGame.pendingWildCard = playedCard
      setGame(newGame)
      setGameState('color-select')
      return
    } else {
      newGame.currentColor = playedCard.color
      action = playedCard.type === 'number' ? `${playedCard.color} ${playedCard.value}` : `${playedCard.color} ${playedCard.type}`
    }

    newGame.playHistory.push({ player: currentPlayer.name, action })

    if (checkUno(currentPlayer)) {
      newGame.playHistory.push({ player: currentPlayer.name, action: 'UNO!' })
    }

    if (currentPlayer.hand.length === 0) {
      setWinner(currentPlayer)
      setGameState('ended')
      return
    }

    // Handle special cards
    if (playedCard.type === 'skip') {
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      newGame.playHistory.push({ player: newGame.players[newGame.currentPlayerIndex].name, action: 'Skipped' })
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
    } else if (playedCard.type === 'reverse') {
      newGame.direction *= -1
      if (newGame.players.length === 2) {
        newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      }
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
    } else if (playedCard.type === 'draw2') {
      newGame.drawCount += 2
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
    } else {
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
    }

    setGame(newGame)
  }

  // Handle draw card
  const drawCard = () => {
    if (!game || gameState !== 'playing') return
    
    const currentPlayer = game.players[game.currentPlayerIndex]
    if (!currentPlayer.isHuman) return

    const newGame = { ...game }
    
    if (newGame.drawCount > 0) {
      const cardsToDraw = newGame.drawCount
      for (let i = 0; i < cardsToDraw; i++) {
        if (newGame.drawPile.length === 0) {
          const lastCard = newGame.discardPile.pop()!
          newGame.drawPile = shuffleDeck(newGame.discardPile)
          newGame.discardPile = [lastCard]
        }
        currentPlayer.hand.push(newGame.drawPile.pop()!)
      }
      newGame.drawCount = 0
      newGame.playHistory.push({ player: currentPlayer.name, action: `Drew ${cardsToDraw} cards` })
    } else {
      if (newGame.drawPile.length === 0) {
        const lastCard = newGame.discardPile.pop()!
        newGame.drawPile = shuffleDeck(newGame.discardPile)
        newGame.discardPile = [lastCard]
      }
      currentPlayer.hand.push(newGame.drawPile.pop()!)
      newGame.playHistory.push({ player: currentPlayer.name, action: 'Drew 1 card' })
    }
    
    newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
    setGame(newGame)
  }

  // Bot turn handling with 1.5 second delay
  useEffect(() => {
    if (game && gameState === 'playing') {
      const currentPlayer = game.players[game.currentPlayerIndex]
      if (currentPlayer.isBot) {
        const timeout = setTimeout(() => {
          setGame(botPlay(game))
        }, 1500)
        return () => clearTimeout(timeout)
      }
    }
  }, [game, gameState, botPlay])

  // Scroll to bottom of log when opened
  useEffect(() => {
    if (showFullLog && logRef.current) {
      setTimeout(() => {
        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight
        }
      }, 100)
    }
  }, [showFullLog])

  // Start game with bots
  const startGameWithBots = () => {
    if (!playerName.trim()) return
    
    const botNames = ['Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5'].slice(0, botCount)
    const allNames = [playerName, ...botNames]
    initializeGame(allNames)
  }

  // Create invite link
  const createInviteGame = () => {
    if (!playerName.trim()) return
    
    initializeGame([playerName])
  }

  // Get card color classes using design system
  const getCardColorClasses = (color: CardColor) => {
    switch (color) {
      case 'red': return 'uno-card-red'
      case 'blue': return 'uno-card-blue'
      case 'green': return 'uno-card-green'
      case 'yellow': return 'uno-card-yellow'
      case 'wild': return 'uno-card-wild'
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

  // Render card using design system
  const renderCard = (card: UnoCard, index?: number, onClick?: () => void, isSmall = false) => {
    const size = isSmall ? 'w-12 h-16' : 'w-16 h-24 sm:w-20 sm:h-28'
    const textSize = isSmall ? 'text-xs' : 'text-base sm:text-2xl'
    const cornerSize = isSmall ? 'text-[10px]' : 'text-xs sm:text-sm'
    
    return (
      <div
        key={card.id}
        className={`${size} uno-card ${getCardColorClasses(card.color)} flex flex-col justify-between p-1 relative`}
        onClick={onClick}
      >
        {/* Top left */}
        <div className={`absolute top-1 left-1 ${cornerSize} font-bold text-white`}>
          {card.type === 'number' ? card.value : 
           card.type === 'skip' ? 'S' :
           card.type === 'reverse' ? 'R' :
           card.type === 'draw2' ? '+2' :
           card.type === 'wild' ? 'W' : '+4'}
        </div>
        
        {/* Center */}
        <div className="flex-1 flex items-center justify-center">
          <span className={`${textSize} font-bold text-white drop-shadow-lg`}>
            {card.type === 'number' ? card.value : 
             card.type === 'skip' ? 'SKIP' :
             card.type === 'reverse' ? '↺' :
             card.type === 'draw2' ? '+2' :
             card.type === 'wild' ? 'WILD' : '+4'}
          </span>
        </div>
        
        {/* Bottom right (rotated) */}
        <div className={`absolute bottom-1 right-1 ${cornerSize} font-bold text-white transform rotate-180`}>
          {card.type === 'number' ? card.value : 
           card.type === 'skip' ? 'S' :
           card.type === 'reverse' ? 'R' :
           card.type === 'draw2' ? '+2' :
           card.type === 'wild' ? 'W' : '+4'}
        </div>
      </div>
    )
  }

  // Color selection modal
  if (gameState === 'color-select') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md fade-in">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Choose a Color</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {colors.filter(c => c !== 'wild').map(color => (
                <Button
                  key={color}
                  onClick={() => handleColorSelection(color)}
                  className={`h-16 sm:h-20 text-sm sm:text-lg font-bold ${getCardColorClasses(color)} text-white hover:scale-105 transition-transform border-2 border-black`}
                >
                  {color.toUpperCase()}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Lobby screen
  if (gameState === 'lobby') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm sm:max-w-md fade-in">
          <CardHeader>
            <CardTitle className="text-3xl sm:text-4xl font-bold text-center bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 bg-clip-text text-transparent">
              UNO
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="playerName">Your Name</Label>
              <Input
                id="playerName"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="botCount">Number of Bots</Label>
              <Select value={botCount.toString()} onValueChange={(v) => setBotCount(parseInt(v))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Bot</SelectItem>
                  <SelectItem value="2">2 Bots</SelectItem>
                  <SelectItem value="3">3 Bots</SelectItem>
                  <SelectItem value="4">4 Bots</SelectItem>
                  <SelectItem value="5">5 Bots</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Button onClick={startGameWithBots} className="w-full" disabled={!playerName.trim()}>
                Play with Bots
              </Button>
              
              <Button onClick={createInviteGame} variant="outline" className="w-full" disabled={!playerName.trim()}>
                Create Invite Game
              </Button>
            </div>

            {inviteLink && (
              <div className="mt-4 p-3 bg-muted rounded">
                <Label>Invite Link:</Label>
                <Input value={inviteLink} readOnly className="mt-1 text-sm" />
                <Button 
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                  className="mt-2 w-full"
                  size="sm"
                >
                  Copy Link
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Game ended screen
  if (gameState === 'ended') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm sm:max-w-md fade-in">
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl text-center">
              {winner?.isHuman ? '🎉 You Won!' : '😔 You Lost'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-lg sm:text-xl">
              {winner?.name} won the game!
            </p>
            <Button onClick={() => setGameState('lobby')} className="w-full">
              Back to Lobby
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Game board
  if (!game) return null

  const currentPlayer = game.players[game.currentPlayerIndex]
  const humanPlayer = game.players.find(p => p.isHuman)!
  const topCard = game.discardPile[game.discardPile.length - 1]

  // Determine actual color from top card
  const actualColor = topCard.color === 'wild' ? game.currentColor : topCard.color

  // Get players in turn order for display
  const getPlayersInTurnOrder = () => {
    return game.players.sort((a, b) => a.turnOrder - b.turnOrder)
  }

  const playersInOrder = getPlayersInTurnOrder()

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 flex flex-col">
      {/* Turn indicator at top */}
      <div className="text-center mb-2 sm:mb-4">
        <div className="bg-card rounded-lg p-2 sm:p-3 inline-block">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <span className="text-sm sm:text-lg font-bold">{currentPlayer.name}'s Turn</span>
            <div className="flex items-center space-x-1">
              {game.direction === 1 ? (
                <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Last played card log */}
      <div className="text-center mb-2 sm:mb-4">
        <div 
          className="bg-card rounded-lg p-2 inline-block cursor-pointer hover:bg-muted transition-colors"
          onClick={() => setShowFullLog(!showFullLog)}
        >
          <div className="text-xs sm:text-sm">
            <div className="font-bold">{game.lastPlayedCard && game.playHistory[game.playHistory.length - 1]?.player}</div>
            <div className="text-muted-foreground">
              {game.lastPlayedCard && game.playHistory[game.playHistory.length - 1]?.action}
            </div>
          </div>
        </div>
      </div>

      {/* Error message popup */}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-destructive text-destructive-foreground px-3 py-1 sm:px-4 sm:py-2 rounded-lg shadow-lg z-50 text-sm">
          {errorMessage}
        </div>
      )}

      {/* UNO! notification */}
      {showUno && (
        <div className="fixed top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="uno-announcement">
            UNO!
          </div>
        </div>
      )}

      {/* Full log modal */}
      {showFullLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowFullLog(false)}>
          <div className="bg-card rounded-lg p-3 sm:p-4 max-w-sm sm:max-w-md w-full max-h-80 sm:max-h-96 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-sm sm:text-base">Game History</h3>
              <div className={`px-2 py-1 rounded text-xs sm:text-sm ${getColorIndicatorClass(actualColor)}`}>
                {actualColor.toUpperCase()}
              </div>
            </div>
            <div ref={logRef} className="space-y-1 text-xs sm:text-sm">
              {game.playHistory.map((entry, index) => (
                <div key={index} className="text-muted-foreground">
                  {entry.player}: {entry.action}
                </div>
              ))}
            </div>
            <Button onClick={() => setShowFullLog(false)} className="mt-3 sm:mt-4 w-full text-sm">Close</Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center">
        {/* Responsive play area */}
        <div className="relative w-full max-w-lg mx-auto">
          {/* Players around the table - responsive circle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 bg-gradient-to-br from-amber-800 via-amber-700 to-amber-900 shadow-2xl border-4 border-amber-900" style={{clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'}}>
              {/* Player positions with highlighting */}
              {playersInOrder.map((player) => {
                let positionClasses = ''
                switch (player.position) {
                  case 0: // bottom (human)
                    positionClasses = 'bottom-2 left-1/2 transform -translate-x-1/2'
                    break
                  case 1: // left
                    positionClasses = 'left-2 top-1/2 transform -translate-y-1/2'
                    break
                  case 2: // top
                    positionClasses = 'top-2 left-1/2 transform -translate-x-1/2'
                    break
                  case 3: // right
                    positionClasses = 'right-2 top-1/2 transform -translate-y-1/2'
                    break
                }

                return (
                  <div key={player.id} className={`absolute ${positionClasses} text-center`}>
                    <div className={`bg-card rounded-lg p-1 sm:p-2 shadow-lg transition-all border ${player.id === currentPlayer.id ? 'player-active' : ''}`}>
                      <div className="text-xs sm:text-sm font-bold">{player.name}</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground">{player.hand.length} cards</div>
                      {!player.isHuman && (
                        <div className="flex justify-center mt-0.5 sm:mt-1">
                          {player.hand.slice(0, 3).map((_, i) => (
                            <div key={i} className="w-2 h-3 sm:w-3 sm:h-4 bg-muted rounded-sm -ml-0.5 sm:-ml-1 border" />
                          ))}
                          {player.hand.length > 3 && <span className="text-[8px] sm:text-xs ml-0.5 sm:ml-1 text-muted-foreground">+{player.hand.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Game area - centered */}
          <div className="relative z-10 flex flex-col items-center justify-center h-64 sm:h-80 md:h-96">
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* Draw Pile */}
              <div className="text-center">
                <div className="w-12 h-16 sm:w-14 sm:h-20 md:w-16 md:h-24 bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg flex items-center justify-center text-white font-bold shadow-lg border border-black">
                  <div className="text-center">
                    <div className="text-sm sm:text-base">{game.drawPile.length}</div>
                    <div className="text-[10px] sm:text-xs">Cards</div>
                  </div>
                </div>
                <Button onClick={drawCard} disabled={!currentPlayer.isHuman} className="mt-1 sm:mt-2 text-[10px] sm:text-xs px-2 py-1">
                  Draw
                </Button>
              </div>

              {/* Discard Pile */}
              <div className="text-center">
                {renderCard(topCard)}
              </div>
            </div>
          </div>
        </div>

        {/* Player Hand */}
        <div className="mt-2 sm:mt-4">
          <Card>
            <CardHeader className="py-2 sm:py-3">
              <CardTitle className="text-center text-sm sm:text-base">{humanPlayer.name}</CardTitle>
            </CardHeader>
            <CardContent className="py-2 sm:py-3">
              <div className="flex flex-wrap gap-1 sm:gap-2 justify-center">
                {humanPlayer.hand.map((card, index) => (
                  <div key={`${card.id}-${index}`} className="flex-shrink-0 card-flip">
                    {renderCard(card, index, () => playCard(index))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}