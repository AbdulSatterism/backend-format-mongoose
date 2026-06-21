import cors from 'cors';
import express, { Request, Response } from 'express';
import globalErrorHandler from './app/middlewares/globalErrorHandler';
import router from './routes';
import { Morgan } from './shared/morgen';
import notFoundRoute from './app/middlewares/notFoundRoute';
import cookieParser from 'cookie-parser';
import { StripeWebhookController } from './app/modules/subscription/subscription.webhook';

const app = express();

//morgan
app.use(Morgan.successHandler);
app.use(Morgan.errorHandler);

//body parser
app.use(
  cors({
    origin: '*',
    credentials: true,
  }),
);
// cookies parser

app.use(cookieParser());

// Webhook MUST be BEFORE express.json() to access raw body
app.post(
  '/subscription',
  express.raw({ type: 'application/json' }),
  StripeWebhookController.handleWebhook,
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//file retrieve
app.use(express.static('uploads'));

//router
app.use('/api/v1', router);

//live response
app.get('/', (req: Request, res: Response) => {
  res.send(
    '<h1 style="text-align:center; color:#A55FEF; font-family:Verdana;">Server is running......</h1>',
  );
});

//*handle not found route;

app.use(notFoundRoute);

//global error handle
app.use(globalErrorHandler);

export default app;
