
const express = require("express")
const router = new express.Router()
const User = require('../models/user')

router.post('/user/register', async(req ,res) => {
   const user = new User(req.body)    
   try{
     await user.save() 
     res.status(201).send(user)
   } catch (err){
    if (err.code === 11000 && err.keyPattern && err.keyPattern.username) {
      return res.status(409).json({  // 409 Conflict is appropriate
        success: false,
        error: 'Username already exists',
        field: 'username'
      });
    }
    //res.status(400).send(err)
      
   }
})

router.post('/user/login', async(req ,res) => {
    
  try{
     const user = await User.findByCredentials(req.body.username,req.body.password)
     const token = await user.generateAuthToken()
 
     const username = user.username;
     const role = user.role;
     const geometryEditing =user.geometryEditing;
     const attributeEditing = user.attributeEditing;
     
     res.send({username,role,token,geometryEditing,attributeEditing})
  } catch (err){
    res.status(400).send(err)
  }
})

module.exports = router