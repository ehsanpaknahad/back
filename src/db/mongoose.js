const mongoose = require('mongoose') 

mongoose.connect('mongodb://127.0.0.1:27017/3D-WebGIS-Users')
  .then(() => {
    console.log("Connected to MongoDB with Mongoose")
  })
  .catch((err) => {
    console.log("Connection error:", err.message)
  })


 