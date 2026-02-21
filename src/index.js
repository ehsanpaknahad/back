const express = require("express")
const cors = require("cors")
require('./db/mongoose')
const userRouter = require("./routers/user")
const apiRouter = require("./routers/api")
const jwt = require("jsonwebtoken")

const app = express()
const port = process.env.PORT || 8080

app.listen( port, () => {
  console.log('server is run on port ' + port)
})

 

app.use(express.json())
app.use(cors())
app.use(userRouter)
app.use(apiRouter)
 
