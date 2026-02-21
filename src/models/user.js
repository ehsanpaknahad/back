const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique:true,
    required: true,  
    trim: true
  },
  tokens: [
    {
      token: {
        type: String,
        required: true
      }
    },
  ],  
  password: {
    type: String,  
    required: true,
    minlength: 7,  
    trim: true
  },
  info: {
    type: String, 
    required: true,
    trim: true
  },
  role: {
    type: String,   
    default: null,
  },   
  geometryEditing: {
    type: [String],    
  },  
  attributeEditing: {
    type: [String],    
  } 
  
})

userSchema.methods.generateAuthToken = async function ( ) {
  const user = this
  const token = jwt.sign(
    {_id:user._id.toString(),     
    },'secrectpasstomakesecuretoken')

  user.tokens = user.tokens.concat({token:token})
  await user.save()

  return token
}

userSchema.statics.findByCredentials = async (username , password) => {
  const user = await User.findOne({ username })

  if(!user){
    throw new Error("Unable to login")
  }

  const isMatch = await bcrypt.compare(password,user.password)
  if(!isMatch){
    throw new Error(" The password does not match")
  }

  return user
}

userSchema.pre('save', async function() {
  const user = this   
  if(user.isModified('password')){    //Mongoose tracks changes to document fields. only if password change then the expression return true
    user.password = await bcrypt.hash(user.password,8)        
  }
 
})

const User = mongoose.model('User',userSchema )

module.exports = User