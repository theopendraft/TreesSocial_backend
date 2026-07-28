import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create transporter with Gmail SMTP
let transporter;

try {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use App Password for Gmail
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Verify transporter configuration
  transporter.verify(function (error, success) {
    if (error) {
      console.error('❌ Email transporter error:', error.message);
    } else {
      console.log('✅ Email server is ready to send messages');
    }
  });
} catch (error) {
  console.error('❌ Failed to create email transporter:', error.message);
}

const FROM_EMAIL = process.env.EMAIL_USER || 'noreply@inventurcubes.com';
const FROM_NAME = 'Treesh Social';

/**
 * Send OTP email
 * @param {string} to - Recipient email
 * @param {string} code - OTP code
 * @param {string} purpose - Purpose of OTP (registration, login, etc.)
 */
export const sendOTPEmail = async (to, code, purpose) => {
  try {
    if (!transporter) {
      throw new Error('Email service is not configured');
    }

    const { subject, html } = getOTPEmailTemplate(code, purpose);

    const mailOptions = {
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: to,
      subject: subject,
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${to} for ${purpose}`);
    console.log('Message ID:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('❌ Email sending error:', error.message);
    throw new Error('Failed to send email');
  }
};

/**
 * Get email template based on purpose
 */
const getOTPEmailTemplate = (code, purpose) => {
  const templates = {
    registration: {
      subject: 'Verify Your Email - Trees Social',
      html: getRegistrationTemplate(code),
    },
    login: {
      subject: 'Your Login Code - Trees Social',
      html: getLoginTemplate(code),
    },
    password_reset: {
      subject: 'Reset Your Password - Trees Social',
      html: getPasswordResetTemplate(code),
    },
    email_verification: {
      subject: 'Verify Your Email - Trees Social',
      html: getEmailVerificationTemplate(code),
    },
    phone_verification: {
      subject: 'Verify Your Phone - Trees Social',
      html: getPhoneVerificationTemplate(code),
    },
  };

  return templates[purpose] || templates.registration;
};

/**
 * Registration Email Template
 */
const getRegistrationTemplate = (code) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .otp-box { background: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0; }
    .otp-code { font-size: 42px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace; }
    .message { color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; color: #856404; font-size: 14px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
    .footer a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌳 Welcome to Trees Social</h1>
    </div>
    <div class="content">
      <p class="message">Hi there! 👋</p>
      <p class="message">Thank you for signing up with <strong>Trees Social</strong>! To complete your registration, please use the verification code below:</p>
      
      <div class="otp-box">
        <div class="otp-code">${code}</div>
        <p style="color: #6c757d; margin-top: 15px; font-size: 14px;">This code expires in 10 minutes</p>
      </div>

      <p class="message">Enter this code in the app to verify your email address and start connecting with friends!</p>

      <div class="warning">
        <strong>⚠️ Security Notice:</strong> Never share this code with anyone. Trees Social will never ask for your verification code via phone or email.
      </div>
    </div>
    <div class="footer">
      <p>Need help? Contact us at <a href="mailto:support@treessocial.com">support@treessocial.com</a></p>
      <p>&copy; 2025 Trees Social. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Login Email Template
 */
const getLoginTemplate = (code) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .otp-box { background: #f8f9fa; border: 2px dashed #11998e; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0; }
    .otp-code { font-size: 42px; font-weight: bold; color: #11998e; letter-spacing: 8px; font-family: 'Courier New', monospace; }
    .message { color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; color: #856404; font-size: 14px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
    .footer a { color: #11998e; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Login Verification</h1>
    </div>
    <div class="content">
      <p class="message">Hello! 👋</p>
      <p class="message">Someone is trying to log in to your <strong>Trees Social</strong> account. If this is you, use the code below:</p>
      
      <div class="otp-box">
        <div class="otp-code">${code}</div>
        <p style="color: #6c757d; margin-top: 15px; font-size: 14px;">This code expires in 10 minutes</p>
      </div>

      <p class="message">Enter this code to complete your login.</p>

      <div class="warning">
        <strong>⚠️ Didn't request this?</strong> If you didn't try to log in, please ignore this email and secure your account immediately.
      </div>
    </div>
    <div class="footer">
      <p>Need help? Contact us at <a href="mailto:support@treessocial.com">support@treessocial.com</a></p>
      <p>&copy; 2025 Trees Social. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Password Reset Email Template
 */
const getPasswordResetTemplate = (code) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .otp-box { background: #f8f9fa; border: 2px dashed #f5576c; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0; }
    .otp-code { font-size: 42px; font-weight: bold; color: #f5576c; letter-spacing: 8px; font-family: 'Courier New', monospace; }
    .message { color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0; }
    .warning { background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; color: #721c24; font-size: 14px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
    .footer a { color: #f5576c; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔒 Reset Your Password</h1>
    </div>
    <div class="content">
      <p class="message">Hello! 👋</p>
      <p class="message">We received a request to reset your <strong>Trees Social</strong> account password. Use the code below to proceed:</p>
      
      <div class="otp-box">
        <div class="otp-code">${code}</div>
        <p style="color: #6c757d; margin-top: 15px; font-size: 14px;">This code expires in 10 minutes</p>
      </div>

      <p class="message">Enter this code to reset your password and regain access to your account.</p>

      <div class="warning">
        <strong>⚠️ Didn't request this?</strong> If you didn't ask to reset your password, please ignore this email. Your password will remain unchanged.
      </div>
    </div>
    <div class="footer">
      <p>Need help? Contact us at <a href="mailto:support@treessocial.com">support@treessocial.com</a></p>
      <p>&copy; 2025 Trees Social. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Email Verification Template
 */
const getEmailVerificationTemplate = (code) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .otp-box { background: #f8f9fa; border: 2px dashed #4facfe; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0; }
    .otp-code { font-size: 42px; font-weight: bold; color: #4facfe; letter-spacing: 8px; font-family: 'Courier New', monospace; }
    .message { color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0; }
    .warning { background: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; margin: 20px 0; color: #0c5460; font-size: 14px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
    .footer a { color: #4facfe; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✉️ Verify Your Email</h1>
    </div>
    <div class="content">
      <p class="message">Hi there! 👋</p>
      <p class="message">To verify your email address with <strong>Trees Social</strong>, please use the code below:</p>
      
      <div class="otp-box">
        <div class="otp-code">${code}</div>
        <p style="color: #6c757d; margin-top: 15px; font-size: 14px;">This code expires in 10 minutes</p>
      </div>

      <p class="message">Enter this code in the app to confirm your email address.</p>

      <div class="warning">
        <strong>ℹ️ Note:</strong> Verifying your email helps keep your account secure and enables important notifications.
      </div>
    </div>
    <div class="footer">
      <p>Need help? Contact us at <a href="mailto:support@treessocial.com">support@treessocial.com</a></p>
      <p>&copy; 2025 Trees Social. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Phone Verification Template
 */
const getPhoneVerificationTemplate = (code) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .otp-box { background: #f8f9fa; border: 2px dashed #fa709a; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0; }
    .otp-code { font-size: 42px; font-weight: bold; color: #fa709a; letter-spacing: 8px; font-family: 'Courier New', monospace; }
    .message { color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; color: #856404; font-size: 14px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
    .footer a { color: #fa709a; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📱 Verify Your Phone</h1>
    </div>
    <div class="content">
      <p class="message">Hi there! 👋</p>
      <p class="message">To verify your phone number with <strong>Trees Social</strong>, please use the code below:</p>
      
      <div class="otp-box">
        <div class="otp-code">${code}</div>
        <p style="color: #6c757d; margin-top: 15px; font-size: 14px;">This code expires in 10 minutes</p>
      </div>

      <p class="message">Enter this code in the app to confirm your phone number.</p>

      <div class="warning">
        <strong>ℹ️ Note:</strong> Verifying your phone helps keep your account secure and enables important alerts.
      </div>
    </div>
    <div class="footer">
      <p>Need help? Contact us at <a href="mailto:support@treessocial.com">support@treessocial.com</a></p>
      <p>&copy; 2025 Trees Social. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

export default {
  sendOTPEmail,
};
