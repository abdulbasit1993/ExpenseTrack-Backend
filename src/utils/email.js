import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Send OTP Email
export async function sendResetPasswordEmail(email, otpCode) {
  const mailOptions = {
    from: `"ExpenseTrack Support" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Your 6-digit OTP for Password Reset",
    text: `
        Password Reset OTP

        Your 6-digit one-time password (OTP) for resetting your password is: ${otpCode}

        This OTP will expire in 10 minutes.

        If you didn't request a password reset, please ignore this email.
    `,
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333; text-align: center;">Password Reset OTP</h2>
        <p style="font-size: 16px; color: #555;">
          Your 6-digit one-time password (OTP) for resetting your password is:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 24px; font-weight: bold; color: #d32f2f; letter-spacing: 4px;">
            ${otpCode}
          </span>
        </div>
        <p style="font-size: 14px; color: #777;">
          This OTP will expire in 10 minutes.
        </p>
        <p style="font-size: 14px; color: #777; margin-top: 30;">
          If you didn't request a password reset, please ignore this email.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}
