type LogType = 'INFO' | 'ERROR' | 'DEBUG';

export const logger = {
    info: (message: string, requestType?: string) => {
        const timestamp = new Date().toISOString();
        const reqType = requestType ? `[${requestType}]` : '';
        console.log(`[${timestamp}] [INFO] ${reqType} ${message}`);
    },
    
    error: (message: string, error?: any, requestType?: string) => {
        const timestamp = new Date().toISOString();
        const reqType = requestType ? `[${requestType}]` : '';
        console.error(`[${timestamp}] [ERROR] ${reqType} ${message}`, error || '');
    },
    
    debug: (message: string, requestType?: string) => {
        const timestamp = new Date().toISOString();
        const reqType = requestType ? `[${requestType}]` : '';
        console.debug(`[${timestamp}] [DEBUG] ${reqType} ${message}`);
    }
};
