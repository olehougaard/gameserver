import express from 'express'
import body_parser from 'body-parser'
import crypto from 'node:crypto'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const app = express()
app.use(express.static('static'))

app.use(body_parser.json())
app.use(function(_, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PATCH");
    next();
  });

const jsonFile = new JSONFile('data/data.json')

const createDb = low => {
  low.data = low.data ?? { users: [], games: [] }
  const data = low.data

  const users = () => data.users
  const addUser = userData => {
    const {username, password} = userData
    if (typeof username === 'string' && typeof password === 'string' && !data.users.some(u => u.username === username)) {
      const user = { ...userData, id: data.users.length, admin: false }
      data.users.push(user)
      low.write()
      return user
    }
  }
  const user = id => data.users.find(u => u.id === id)
  const findUser = ({username, password}) => data.users.find(u => u.username === username && u.password === password)
  const updateUser = user => {
    const idx = data.users.findIndex(u => u.id === user.id)
    if (idx === -1)
      return false
    else {
      data.users[idx] = user
      low.write()
      return true
    }
  }

  const games = () => data.games
  const game = id => data.games.find(g => g.id === id)
  const createGame = user => {
    const game = { user: user.id, id: data.games.length + 1, score: 0, completed: false }
    data.games.push(game)
    low.write()
    return game
  }
  const updateGame = game => {
    const idx = data.games.findIndex(g => g.id === game.id)
    if (idx === -1)
      return false
    else {
      data.games[idx] = game
      low.write()
      return true
    }
  }

  return { users, addUser, user, findUser, updateUser, games, game, createGame, updateGame }
}

let db
const sessions = new Map()

const sessionUser = (req) => db.user(sessions.get(req.query.token))
const withSession = (req, res, callback) => {
  const user = sessionUser(req)
  if (user)
    callback(user)
  else
    res.sendStatus(403)
}

app.post('/login', (req, res) => {
  const user = db.findUser(req.body)
  if (user) {
    const token = crypto.randomBytes(16).toString('hex')
    sessions.set(token, user.id)
    res.send({token})
  } else {
    res.sendStatus(403)
  }
})

app.post('/logout', (req, res) => {
  if (req.query.token && sessions.get(req.query.token)) {
    sessions.delete(req.query.token)
    res.sendStatus(200)
  } else {
    res.sendStatus(403)
  }
})

app.get('/users', (req, res) => {
  if (sessionUser(req)?.admin)
    res.send(db.users())  
  else
    res.sendStatus(403)
})

app.post('/users', (req, res) => {
  const user = db.addUser(req.body)
  if (user !== undefined) {
    res.status(201)
    res.send(user)
  } else {
    res.sendStatus(400)
  }
})

app.get('/users/:id', (req, res) => {
  withSession(req, res, user => {
    const id = parseInt(req.params.id)
    if (user.id === id || user.admin)
      res.send(db.user(id))
    else
      res.sendStatus(403)
  })
})

app.patch('/users/:id', (req, res) => {
  withSession(req, res, user => {
    const id = parseInt(req.params.id)
    if (user.id === id || user.admin) {
      const updUser = db.user(id)
      db.updateUser({ ...updUser, ...req.body, id, username: updUser.username, admin: user.admin? req.body.admin ?? updUser.admin : updUser.admin })
      res.sendStatus(200)
    } else
      res.sendStatus(403)
  })
})

app.get('/games', (req, res) => {
  withSession(req, res, _ => res.send(db.games()))
})

app.post('/games', (req, res) => {
  withSession(req, res, user => {
    res.status(201)
    res.send(db.createGame(user))
  })
})

app.get('/games/:id', (req, res) => {
  withSession(req, res, user => {
    const id = parseInt(req.params.id)
    const game = db.game(id)
    if (!game)
      res.sendStatus(404)
    else if (game.user.id !== user.id)
      res.sendStatus(403)
    else {
      res.send(game)
    }
  })
})

app.patch('/games/:id', (req, res) => {
  withSession(req, res, user => {
    const id = parseInt(req.params.id)
    const game = db.game(id)
    if (!game)
      res.sendStatus(404)
    else if (game.user.id !== user.id)
      res.sendStatus(403)
    else {
      db.updateGame({ ...game, ...req.body, user: game.user, id })
      res.sendStatus(200)
    }
  })
})

async function start() {
  const low = new Low(jsonFile)
  await low.read()
  low.data = low.data ?? { users: [] }
  db = createDb(low)
  app.listen(9090, () => console.log('Listening on port 9090'))
}
start()
