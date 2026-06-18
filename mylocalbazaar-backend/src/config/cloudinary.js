// src/config/cloudinary.js
// ─────────────────────────────────────────────────────────────
// Cloudinary Configuration — MyLocalBazaar.store
// Handles all media uploads: products, KYC docs, delivery proof
// ─────────────────────────────────────────────────────────────

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const logger = require('./logger');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

// ── Folder structure on Cloudinary ────────────────────────────
const isPresentPathSegment = (segment) => (
  segment !== undefined && segment !== null && String(segment).trim() !== ''
);

const joinCloudinaryPath = (...segments) =>
  segments
    .filter(isPresentPathSegment)
    .map((segment) => String(segment).replace(/^\/+|\/+$/g, ''))
    .join('/');

const getMerchantProductFolder = (req) => {
  const merchantId = req.user?.id;
  if (!merchantId) {
    throw new Error('Merchant identifier missing for product image upload');
  }
  return joinCloudinaryPath(
    process.env.CLOUDINARY_FOLDER,
    'merchants',
    merchantId,
    'products'
  );
};

const FOLDERS = {
  products:       joinCloudinaryPath(process.env.CLOUDINARY_FOLDER, 'products'),
  merchants:      joinCloudinaryPath(process.env.CLOUDINARY_FOLDER, 'merchants'),
  kyc:            joinCloudinaryPath(process.env.CLOUDINARY_FOLDER, 'kyc'),
  users:          joinCloudinaryPath(process.env.CLOUDINARY_FOLDER, 'users'),
  banners:        joinCloudinaryPath(process.env.CLOUDINARY_FOLDER, 'banners'),
  deliveryProof:  joinCloudinaryPath(process.env.CLOUDINARY_FOLDER, 'delivery-proof'),
  reviews:        joinCloudinaryPath(process.env.CLOUDINARY_FOLDER, 'reviews'),
  services:       joinCloudinaryPath(process.env.CLOUDINARY_FOLDER, 'services'),
  paymentProof:   joinCloudinaryPath(process.env.CLOUDINARY_FOLDER, 'payment-proof'),
};

// ── Multer storage factory ─────────────────────────────────────
const createStorage = (folder, allowedFormats = ['jpg', 'jpeg', 'png', 'webp']) =>
  new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
      folder: typeof folder === 'function' ? await folder(req, file) : folder,
      allowed_formats: allowedFormats,
      transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
    }),
  });

// ── File filter ────────────────────────────────────────────────
const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'), false);
};

const documentFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Only JPEG, PNG, and PDF files are allowed for documents'), false);
};

// ── Pre-configured upload middlewares ─────────────────────────
// Accepts up to 15 files per request; the effective per-product cap is
// enforced downstream by FeatureGate (plan- and store_category-aware).
const uploadProductImage = multer({
  storage:  createStorage(getMerchantProductFolder),
  fileFilter: imageFilter,
  limits:   { fileSize: 5 * 1024 * 1024 }, // 5MB
}).array('images', 15);

const uploadMerchantLogo = multer({
  storage:  createStorage(FOLDERS.merchants),
  fileFilter: imageFilter,
  limits:   { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single('logo');

const uploadKYCDocument = multer({
  storage:  createStorage(FOLDERS.kyc, ['jpg', 'jpeg', 'png', 'pdf']),
  fileFilter: documentFilter,
  limits:   { fileSize: 10 * 1024 * 1024 }, // 10MB
}).fields([
  { name: 'gst_certificate',  maxCount: 1 },
  { name: 'pan_card',         maxCount: 1 },
  { name: 'aadhaar_front',    maxCount: 1 },
  { name: 'aadhaar_back',     maxCount: 1 },
  { name: 'shop_license',     maxCount: 1 },
  { name: 'food_license',     maxCount: 1 },
]);

const uploadDeliveryProof = multer({
  storage:  createStorage(FOLDERS.deliveryProof),
  fileFilter: imageFilter,
  limits:   { fileSize: 5 * 1024 * 1024 },
}).single('proof');

const uploadUserAvatar = multer({
  storage:  createStorage(FOLDERS.users),
  fileFilter: imageFilter,
  limits:   { fileSize: 2 * 1024 * 1024 },
}).single('avatar');

const uploadBanner = multer({
  storage:  createStorage(FOLDERS.banners),
  fileFilter: imageFilter,
  limits:   { fileSize: 5 * 1024 * 1024 },
}).single('image');

const uploadReviewImages = multer({
  storage:  createStorage(FOLDERS.reviews),
  fileFilter: imageFilter,
  limits:   { fileSize: 3 * 1024 * 1024 },
}).array('images', 4);

const uploadPaymentScreenshot = multer({
  storage:  createStorage(FOLDERS.paymentProof),
  fileFilter: imageFilter,
  limits:   { fileSize: 5 * 1024 * 1024 },
}).single('screenshot');

// ── Delete media helper ────────────────────────────────────────
const deleteMedia = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info(`Cloudinary: deleted ${publicId}`, { result });
    return result;
  } catch (err) {
    logger.error('Cloudinary delete error:', { publicId, message: err.message });
    throw err;
  }
};

module.exports = {
  cloudinary,
  FOLDERS,
  uploadProductImage,
  uploadMerchantLogo,
  uploadKYCDocument,
  uploadDeliveryProof,
  uploadUserAvatar,
  uploadBanner,
  uploadReviewImages,
  uploadPaymentScreenshot,
  deleteMedia,
};
