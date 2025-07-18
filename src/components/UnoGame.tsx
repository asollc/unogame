import { useState, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, ArrowRight, Trophy, History } from 'lucide-react'

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
  const [botCount, setBotCount] = useState(2)
  const [inviteLink, setInviteLink] = useState('')
  const [selectedColor, setSelectedColor] = useState<CardColor | null>(null)
  const [winner, setWinner] = useState<Player | null>(null)
  const [gameId, setGameId] = useState('')
  const [showUno, setShowUno] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // Initialize game
  const initializeGame = useCallback((playerNames: string[]) => {
    const deck = shuffleDeck(generateDeck())
    const players: Player[] = playerNames.map((name, index) => ({
      id: `player-${index}`,
      name,
      hand: [],
      isBot: index > 0 && playerNames.length > 1,
      isHuman: index === 0
    }))

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
      direction: 1,
      drawPile: deck,
      discardPile: [firstCard],
      currentColor: firstCard.color === 'wild' ? 'red' : firstCard.color,
      drawCount: 0,
      playHistory: [{ player: 'Game Start', action: `${firstCard.color} ${firstCard.type === 'number' ? firstCard.value : firstCard.type}` }]
    }

    setGameId(newGame.id)
    setInviteLink(`${window.location.origin}?game=${newGame.id}`)
    setGame(newGame)
    setGameState('playing')
  }, [])

  // Start game with bots
  const startGameWithBots = () => {
    if (!playerName.trim()) return
    
    const botNames = ['Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5'].slice(0, botCount)
    const allNames = [playerName, ...botNames]
    initializeGame(allNames)
  }

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
      
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      return newGame
    }

    if (playableCards.length > 0) {
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

      if (cardToPlay.type === 'skip') {
        newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
        newGame.playHistory.push({ player: game.players[newGame.currentPlayerIndex].name, action: 'Skipped' })
        newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      } else if (cardToPlay.type === 'reverse') {
        newGame.direction *= -1
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

    const card = currentPlayer.hand[cardIndex]
    const topCard = game.discardPile[game.discardPile.length - 1]

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
      showError("Can't play that")
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

    if (playedCard.type === 'skip') {
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
      newGame.playHistory.push({ player: game.players[newGame.currentPlayerIndex].name, action: 'Skipped' })
      newGame.currentPlayerIndex = (newGame.currentPlayerIndex + newGame.direction + newGame.players.length) % newGame.players.length
    } else if (playedCard.type === 'reverse') {
      newGame.direction *= -1
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

  // Get card color classes
  const getCardColorClasses = (color: CardColor) => {
    switch (color) {
      case 'red': return 'bg-red-600'
      case 'blue': return 'bg-blue-600'
      case 'green': return 'bg-green-600'
      case 'yellow': return 'bg-yellow-400 text-white'
      case 'wild': return 'bg-gradient-to-br from-red-600 via-yellow-400 to-blue-600'
    }
  }

  // Get color indicator class
  const getColorIndicatorClass = (color: CardColor) => {
    switch (color) {
      case 'red': return 'bg-red-600 text-white'
      case 'blue': return 'bg-blue-600 text-white'
      case 'green': return 'bg-green-600 text-white'
      case 'yellow': return 'bg-yellow-400 text-white'
      case 'wild': return 'bg-gray-600 text-white'
    }
  }

  // Render card with all text right side up and white
  const renderCard = (card: UnoCard, index?: number, onClick?: () => void, isSmall = false) => {
    const size = isSmall ? 'w-10 h-14' : 'w-12 h-16 sm:w-14 sm:h-20'
    const textSize = isSmall ? 'text-[10px]' : 'text-xs sm:text-base'
    const cornerSize = isSmall ? 'text-[8px]' : 'text-[10px] sm:text-xs'
    
    return (
      <div
        key={card.id}
        className={`${size} rounded border border-black flex flex-col justify-between p-0.5 cursor-pointer hover:scale-105 transition-transform ${getCardColorClasses(card.color)} ${onClick ? 'hover:shadow-lg' : ''} relative shadow-lg`}
        onClick={onClick}
      >
        {/* Top left */}
        <div className={`absolute top-0.5 left-0.5 ${cornerSize} font-bold text-white`}>
          {card.type === 'number' ? card.value : 
           card.type === 'skip' ? 'S' :
           card.type === 'reverse' ? 'R' :
           card.type === 'draw2' ? '+2' :
           card.type === 'wild' ? 'W' : '+4'}
        </div>
        
        {/* Center */}
        <div className="flex-1 flex items-center justify-center">
          <span className={`${textSize} font-bold text-white`}>
            {card.type === 'number' ? card.value : 
             card.type === 'skip' ? 'SKIP' :
             card.type === 'reverse' ? '↺' :
             card.type === 'draw2' ? '+2' :
             card.type === 'wild' ? 'WILD' : '+4'}
          </span>
        </div>
        
        {/* Bottom right */}
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
              <Label htmlFor="botCount" className="text-white">Number of Bots</Label>
              <Select value={botCount.toString()} onValueChange={(v) => setBotCount(parseInt(v))}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-700 border-gray-600">
                  <SelectItem value="1" className="text-white">1 Bot</SelectItem>
                  <SelectItem value="2" className="text-white">2 Bots</SelectItem>
                  <SelectItem value="3" className="text-white">3 Bots</SelectItem>
                  <SelectItem value="4" className="text-white">4 Bots</SelectItem>
                  <SelectItem value="5" className="text-white">5 Bots</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={startGameWithBots} className="w-full" disabled={!playerName.trim()}>
              Play with Bots
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Game ended screen
  if (gameState === 'ended') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        {winner && <Confetti />}
        <Card className="w-full max-w-md mx-auto bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-white">
              {winner?.isHuman ? '🎉 You Won!' : '😔 You Lost'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-xl text-white">
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
  const actualColor = topCard.color === 'wild' ? game.currentColor : topCard.color
  const lastMove = game.playHistory[game.playHistory.length - 1]

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
    
    return positions[totalPlayers]?.[index] || positions[4][index % 4]
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Top bar with containers */}
      <div className="flex justify-between items-center p-2 sm:p-4">
        <div className="bg-gray-800 rounded-lg p-2 shadow-lg">
          <div className="text-left">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white">Player turn: {currentPlayer.name}</span>
              <div className={`px-2 py-1 rounded text-xs ${getColorIndicatorClass(actualColor)}`}>
                {actualColor.toUpperCase()}
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
        </div>

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
      </div>

      {/* UNO! notification */}
      {showUno && (
        <div className="fixed top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="text-6xl font-bold text-red-500 animate-pulse">
            UNO!
          </div>
        </div>
      )}

      {/* Match end message */}
      {winner && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-3 py-2 rounded-lg shadow-lg z-50">
          <div className="flex items-center space-x-2">
            <Trophy className="w-5 h-5" />
            <span>{winner.name} wins!</span>
          </div>
        </div>
      )}

      {/* Game area with hexagon layout */}
      <div className="flex-1 relative">
        {/* Center area with deck and discard pile */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center space-x-4">
          {/* Deck and draw button */}
          <div className="text-center">
            <div className="w-12 h-16 sm:w-14 sm:h-20 bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl flex items-center justify-center text-white font-bold shadow-lg border-2 border-dashed border-gray-600">
              <div className="text-center">
                <div className="text-sm">{game.drawPile.length}</div>
                <div className="text-[10px]">Cards</div>
              </div>
            </div>
            <Button 
              onClick={drawCard} 
              disabled={!currentPlayer.isHuman || (currentPlayer.isHuman && game.drawCount > 0)}
              className={`mt-1 text-[10px] px-2 py-1 border-2 border-white ${game.drawCount > 0 ? 'animate-pulse bg-red-600' : ''}`}
            >
              Draw
            </Button>
          </div>

          {/* Discard pile */}
          <div>
            {renderCard(topCard)}
          </div>
        </div>

        {/* Player hands positioned at hexagon points */}
        {game.players.map((player, index) => {
          const position = getPlayerPosition(index, game.players.length)
          const isCurrentPlayer = player.id === currentPlayer.id
          
          return (
            <div
              key={player.id}
              className="absolute"
              style={position}
            >
              <div className={`bg-gray-800 rounded-lg p-2 shadow-lg ${isCurrentPlayer ? 'border-2 border-lime-400' : ''}`}>
                <div className="text-xs font-bold text-white text-center mb-1">{player.name}</div>
                
                {player.isHuman ? (
                  <div className="flex flex-wrap gap-1 justify-center">
                    {Array.from({ length: Math.min(player.hand.length, 3) }).map((_, i) => (
                      <div key={i} className="w-2 h-3 bg-gray-600 rounded-sm -ml-0.5 border border-gray-500" />
                    ))}
                    {player.hand.length > 3 && (
                      <span className="text-[8px] ml-0.5 text-gray-300">+{player.hand.length - 3}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex justify-center">
                    {Array.from({ length: Math.min(player.hand.length, 5) }).map((_, i) => (
                      <div key={i} className="w-2 h-3 bg-gray-600 rounded-sm -ml-0.5 border border-gray-500" />
                    ))}
                    {player.hand.length > 5 && (
                      <span className="text-[8px] ml-0.5 text-gray-300">+{player.hand.length - 5}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Human player hand at bottom */}
      <div className="mt-2 sm:mt-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="py-2 sm:py-3">
            <CardTitle className="text-center text-white text-sm sm:text-base">{humanPlayer.name}</CardTitle>
          </CardHeader>
          <CardContent className="py-2 sm:py-3">
            <div className="flex flex-wrap gap-1 sm:gap-2 justify-center overflow-x-auto max-w-full">
              <div className={`flex gap-1 sm:gap-2 ${humanPlayer.hand.length > 7 ? 'min-w-max' : ''}`}>
                {humanPlayer.hand.map((card, index) => (
                  <div key={`${card.id}-${index}`} className="flex-shrink-0">
                    {renderCard(card, index, () => playCard(index))}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Color selection modal */}
      {gameState === 'color-select' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-center text-white">Choose a Color</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {colors.filter(c => c !== 'wild').map(color => (
                  <Button
                    key={color}
                    onClick={() => {
                      setSelectedColor(color)
                      handleColorSelection(color)
                    }}
                    className={`h-16 text-sm font-bold ${getCardColorClasses(color)} hover:scale-105 transition-transform`}
                  >
                    {color.toUpperCase()}
                  </Button>
                ))}
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

      {/* Error message */}
      {errorMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-3 py-2 rounded-lg shadow-lg z-50 text-sm">
          {errorMessage}
        </div>
      )}
    </div>
  )
}