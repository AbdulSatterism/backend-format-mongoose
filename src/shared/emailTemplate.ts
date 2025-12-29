import { ICreateAccount, IResetPassword } from '../types/emailTamplate';

const createAccount = (values: ICreateAccount) => {
  const data = {
    to: values.email,
    subject: 'Verify your account',
    html: `<body style="font-family: Arial, sans-serif; background-color: #f9f9f9; margin: 0; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; padding: 30px; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        <h2 style="color: #333; font-size: 20px; margin-bottom: 10px;">Hi ${values.name},</h2>
        
        <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">
            Your single use verification code is:
        </p>
        
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; border-radius: 6px; border-left: 4px solid #FB9400; margin: 25px 0; font-family: monospace;">
            <span style="color: #333; font-size: 28px; letter-spacing: 3px; font-weight: bold;">${values.otp}</span>
        </div>
        
        <p style="color: #777; font-size: 14px; line-height: 1.5; margin-bottom: 15px;">
            This code is valid for 20 minutes.
        </p>
        
        <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px;">
            <p style="color: #888; font-size: 13px; line-height: 1.4; margin: 0;">
                If you didn't request this code, you can safely ignore this email. Someone else might have entered your email address by mistake.
            </p>
        </div>
    </div>
</body>`,
  };
  return data;
};

const resetPassword = (values: IResetPassword) => {
  const data = {
    to: values.email,
    subject: 'Reset your password',
    html: `<body style="font-family: Arial, sans-serif; background-color: #f9f9f9; margin: 0; padding: 20px; color: #555;">
    <div style="width: 100%; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
        <div style="text-align: center;">
            <p style="color: #555; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">Your single use code is:</p>
            <div style="background-color: #FB9400; width: 120px; padding: 10px; text-align: center; border-radius: 8px; color: #fff; font-size: 25px; letter-spacing: 2px; margin: 20px auto;">${values.otp}</div>
            <p style="color: #555; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">This code is valid for 20 minutes.</p>
            <p style="color: #555; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">If you didn't request this code, you can safely ignore this email. Someone else might have typed your email address by mistake.</p>
        </div>
    </div>
</body>`,
  };
  return data;
};

export const emailTemplate = {
  createAccount,
  resetPassword,
};
