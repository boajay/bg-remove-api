import bodyParser from 'body-parser';
import express from 'express';
import autocrop from 'autocrop-js';
import { removeBackground } from '@imgly/background-removal-node';
import fs from 'fs/promises';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { verifyRequestSignature } from '../utils.js';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import tmp from 'tmp';
import { Worker } from 'worker_threads';
import dotenv from 'dotenv';
import { auth } from '../firebase.js';  // Update this line
dotenv.config();

const app = express();
app.enable('trust proxy');
app.set('trust proxy', '192.168.1.1, 10.0.0.0/8');
app.use(helmet());
app.use(compression());
app.use(bodyParser.urlencoded({ limit: '5000mb', extended: true }));
app.use(bodyParser.json({ limit: '5000mb' }));
app.use(express.json());
app.use(cors({origin: '*'}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));

// MySQL connection configuration
// const dbConfig = {
//   host: process.env.DB_HOST,
//   port: parseInt(process.env.DB_PORT, 10),
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   waitForConnections: process.env.DB_WAIT_FOR_CONNECTIONS === 'true',
//   connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10),
//   queueLimit: parseInt(process.env.DB_QUEUE_LIMIT, 10)
// };



// Initialize MySQL connection pool
// const pool = mysql.createPool(dbConfig);

// Middleware to check if user is authenticated using JWT
const isAuthenticated = (req, res, next) => {
  // const token = req.headers['authorization'].slice(7);
  // if (!token) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }
  // jwt.verify(token, 'jwt-131', (err, decoded) => {
  //   if (err) {
  //     return res.status(401).json({ error: 'Unauthorized' });
  //   }
  //   req.user = decoded;
  //   next();
  // });
  const token = req.headers['authorization'].slice(7);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }else{
  // idToken comes from the client app
auth
.verifyIdToken(token)
.then((decodedToken) => {
  const uid = decodedToken.uid;
  if(uid){
    req.user = uid;
    next();
  }else{
    return res.status(401).json({ error: 'Unauthorized' });
  }
})
.catch((error) => {
  console.error('Error while verifying Id Token:', error);
  return res.status(401).json({ error: 'Unauthorized' });
  // Handle error
});
 
}

};

// Register route
// app.post('/register', async (req, res) => {
//   const { username, password, cdate, udate } = req.body;
//   try {
//     const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
//     if (rows.length > 0) {
//       return res.status(400).json({ error: 'Username already exists' });
//     }
//     const hashedPassword = await bcrypt.hash(password, 10);
//     await pool.query('INSERT INTO users (username, password, create_date, update_date) VALUES (?, ?, ?, ?)', [username, hashedPassword, cdate, udate]);
//     res.json({ message: 'Registration successful' });
//   } catch (error) {
//     console.error('Error during registration:', error);
//     res.status(500).json({ error: 'Registration failed' });
//   }
// });

// Login route
// app.post('/login', async (req, res) => {
//   const { username, password } = req.body;
//   try {
//     const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
//     const user = rows[0];
//     if (user && await bcrypt.compare(password, user.password)) {
//       const token = jwt.sign({ id: user.id, username: user.username }, 'jwt-131', { expiresIn: '1d' });
//       res.json({ token });
//     } else {
//       res.status(401).json({ error: 'Invalid username or password' });
//     }
//   } catch (error) {
//     res.status(500).json({ error: 'Login failed' });
//   }
// });
app.get('/test', (req, res) => {
  res.json({ message: 'test success!'});
});
// Check Authentication
app.get('/checkAuth', isAuthenticated, (req, res) => {
  res.json({ message: 'Authenticated', user: req.user });
});

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    tmp.dir({ unsafeCleanup: true }, (err, path) => {
      if (err) throw err;
      cb(null, path);
    });
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const mimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!mimeTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'), false);
    }
    cb(null, true);
  }
});

// const __filename = fileURLToPath(import.meta.url);
const __dirname = path.resolve();

// app.post('/removebgandcrop',function(req,res){
//   res.send('success');

// });
app.post('/removebgandcrop', upload.single('file'),async function(req,res){ 

  const imgSource = req.file;
  if (!imgSource) {
        return res.status(400).json({ error: 'Missing image source' });
  }
try{
  const dataUrlToBuffer = (dataUrl) => {
  const base64String = dataUrl.split(',')[1];
  return Buffer.from(base64String, 'base64');
};
  const imgPath=imgSource.path;
  const originalName= imgSource.originalname;
  const processedBuffer = await removeBackground(imgPath);
  const buffer = Buffer.from(await processedBuffer.arrayBuffer());
  const result = await autocrop(buffer, { alphaThreshold: 10 });
  const croppedBuffer = dataUrlToBuffer(result.dataURL);
  res.set({
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename=${imgSource.originalname}`
        });
        res.send(croppedBuffer);
      } catch (error) {
        res.send(error.message)
      }
 })
// app.post('/removebgandcrop', isAuthenticated, upload.single('file'), verifyRequestSignature, (req, res) => {
  
//   const imgSource = req.file;
//   if (!imgSource) {
//     return res.status(400).json({ error: 'Missing image source' });
//   }

//   const worker = new Worker(path.join(__dirname, './worker.js'), {
//     workerData: {
//       imgPath: imgSource.path,
//       originalName: imgSource.originalname
//     }
//   });

//   worker.on('message', (result) => {
//     res.set({
//       'Content-Type': 'image/png',
//       'Content-Disposition': `attachment; filename=${imgSource.originalname}`
//     });
//     res.send(Buffer.from(result, 'base64'));
//   });

//   worker.on('error', (error) => {
//     res.status(500).json({ error: error.message });
//   });

//   worker.on('exit', async (code) => {
//     if (code !== 0) {
//       res.status(500).json({ error: `Worker stopped with exit code ${code}` });
//     }
//     // Delete temporary file
//     if (imgSource && imgSource.path) {
//       try {
//         await fs.unlink(imgSource.path);
//       } catch (err) {
//         console.error(`Error deleting file: ${imgSource.path}`, err);
//       }
//     }
//   });
// });

app.listen(3001, () => {
  console.log('Server listening on port 3001');
});