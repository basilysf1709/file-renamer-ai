import os
import asyncpg
import asyncio
from typing import Optional
from loguru import logger

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://neondb_owner:npg_1zxdZhbAPM5F@ep-dry-darkness-adckofhw-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

class Database:
    def __init__(self):
        self.pool = None
    
    async def connect(self):
        try:
            self.pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
            logger.info("Connected to PostgreSQL database")
            await self.init_tables()
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    async def disconnect(self):
        if self.pool:
            await self.pool.close()
            logger.info("Disconnected from PostgreSQL database")
    
    async def init_tables(self):
        """Initialize database tables"""
        async with self.pool.acquire() as conn:
            # Create users table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    access_token_hash VARCHAR(255),
                    credits INTEGER DEFAULT 5,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            
            # Create credits_transactions table for audit trail
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS credit_transactions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    amount INTEGER NOT NULL,
                    transaction_type VARCHAR(50) NOT NULL,
                    description TEXT,
                    stripe_payment_id VARCHAR(255),
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)
            
            logger.info("Database tables initialized")
    
    async def get_or_create_user(self, email: str, access_token_hash: str) -> dict:
        """Get user by email or create new user with 5 credits"""
        async with self.pool.acquire() as conn:
            # Try to find existing user
            user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
            
            if user:
                # Update access token hash
                await conn.execute(
                    "UPDATE users SET access_token_hash = $1, updated_at = NOW() WHERE email = $2",
                    access_token_hash, email
                )
                return dict(user)
            else:
                # Create new user with 5 credits
                user_id = await conn.fetchval("""
                    INSERT INTO users (email, access_token_hash, credits) 
                    VALUES ($1, $2, 5) 
                    RETURNING id
                """, email, access_token_hash)
                
                # Log the initial credit grant
                await conn.execute("""
                    INSERT INTO credit_transactions (user_id, amount, transaction_type, description)
                    VALUES ($1, 5, 'initial_grant', 'Welcome bonus: 5 free credits')
                """, user_id)
                
                logger.info(f"Created new user {email} with 5 credits")
                
                return {
                    'id': user_id,
                    'email': email,
                    'access_token_hash': access_token_hash,
                    'credits': 5
                }
    
    async def get_user_credits(self, email: str) -> int:
        """Get user's current credit balance"""
        async with self.pool.acquire() as conn:
            credits = await conn.fetchval("SELECT credits FROM users WHERE email = $1", email)
            return credits or 0
    
    async def deduct_credits(self, email: str, amount: int = 1, description: str = "AI rename operation") -> bool:
        """Deduct credits from user account. Returns True if successful, False if insufficient credits"""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                current_credits = await conn.fetchval("SELECT credits FROM users WHERE email = $1", email)
                
                if current_credits is None or current_credits < amount:
                    return False
                
                # Deduct credits
                await conn.execute(
                    "UPDATE users SET credits = credits - $1, updated_at = NOW() WHERE email = $2",
                    amount, email
                )
                
                # Log transaction
                user_id = await conn.fetchval("SELECT id FROM users WHERE email = $1", email)
                await conn.execute("""
                    INSERT INTO credit_transactions (user_id, amount, transaction_type, description)
                    VALUES ($1, $2, 'deduction', $3)
                """, user_id, -amount, description)
                
                return True
    
    async def add_credits(self, email: str, amount: int, stripe_payment_id: str = None, description: str = "Credit purchase") -> bool:
        """Add credits to user account"""
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Add credits
                await conn.execute(
                    "UPDATE users SET credits = credits + $1, updated_at = NOW() WHERE email = $2",
                    amount, email
                )
                
                # Log transaction
                user_id = await conn.fetchval("SELECT id FROM users WHERE email = $1", email)
                await conn.execute("""
                    INSERT INTO credit_transactions (user_id, amount, transaction_type, description, stripe_payment_id)
                    VALUES ($1, $2, 'purchase', $3, $4)
                """, user_id, amount, description, stripe_payment_id)
                
                logger.info(f"Added {amount} credits to user {email}")
                return True

# Global database instance
db = Database() 