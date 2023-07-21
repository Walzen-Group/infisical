import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { NextFunction, Request, Response } from "express";
import {
	getAuthAPIKeyPayload,
	getAuthSAAKPayload,
	getAuthSTDPayload,
	getAuthUserPayload,
	validateAuthMode,
} from "../helpers/auth";
import {
	IServiceAccount,
	IServiceTokenData,
	IUser,
} from "../models";
import {
	AUTH_MODE_API_KEY,
	AUTH_MODE_JWT,
	AUTH_MODE_SERVICE_ACCOUNT,
	AUTH_MODE_SERVICE_TOKEN,
} from "../variables";
import { getChannelFromUserAgent } from "../utils/posthog";

declare module "jsonwebtoken" {
	export interface UserIDJwtPayload extends jwt.JwtPayload {
		userId: string;
	}
}

/**
 * Validate if token on request is valid (e.g. not expired) for various auth modes:
 * - If token is a JWT token, then check if there is an associated user
 * and if user is fully setup.
 * - If token is a service token (st), then check if there is associated
 * service token data.
 * @param {Object} obj
 * @param {String[]} obj.acceptedAuthModes - accepted modes of authentication (jwt/st)
 * @returns
 */
const requireAuth = ({
	acceptedAuthModes = [AUTH_MODE_JWT],
}: {
	acceptedAuthModes: string[];
}) => {
	return async (req: Request, res: Response, next: NextFunction) => {

		// validate auth token against accepted auth modes [acceptedAuthModes]
		// and return token type [authTokenType] and value [authTokenValue]
		const { authMode, authTokenValue } = validateAuthMode({
			headers: req.headers,
			acceptedAuthModes,
		});

		let authPayload: IUser | IServiceAccount | IServiceTokenData;
		let authUserPayload: {
			user: IUser;
			tokenVersionId: Types.ObjectId;
		};
		switch (authMode) {
			case AUTH_MODE_SERVICE_ACCOUNT:
				authPayload = await getAuthSAAKPayload({
					authTokenValue,
				});
				req.serviceAccount = authPayload;
				break;
			case AUTH_MODE_SERVICE_TOKEN:
				authPayload = await getAuthSTDPayload({
					authTokenValue,
				});
				req.serviceTokenData = authPayload;
				break;
			case AUTH_MODE_API_KEY:
				authPayload = await getAuthAPIKeyPayload({
					authTokenValue,
				});
				req.user = authPayload;
				break;
			default:
				authUserPayload = await getAuthUserPayload({
					authTokenValue,
				});
				authPayload = authUserPayload.user;
				req.user = authUserPayload.user;
				req.tokenVersionId = authUserPayload.tokenVersionId;
				break;
		}

		req.requestData = {
			...req.params,
			...req.query,
			...req.body,
		}

		req.authData = {
			authMode,
			authPayload, // User, ServiceAccount, ServiceTokenData
			authChannel: getChannelFromUserAgent(req.headers["user-agent"]),
			authIP: req.realIP,
			authUserAgent: req.headers["user-agent"] ?? "other",
			tokenVersionId: req.tokenVersionId,
		}

		return next();
	}
}

export default requireAuth;
