-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    access_token_hash VARCHAR(255),
    credits INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Credit transactions audit trail
CREATE TABLE credit_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    amount INTEGER NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    description TEXT,
    stripe_payment_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);