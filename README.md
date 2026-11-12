# PayWise: Smart Banking Assistant

## The problem

Retail bank customers call the bank or visit the branch for simple things: checking a balance, finding out where their money went, moving money between their own accounts and setting a spending limit. This overloads the call centre.

## What our app does

- A banking chat where the customer asks in plain English and the AI agent picks the right tools by itself
- Shows account balances, with frozen accounts clearly marked
- Explains spending by category, this month and last month
- Moves money between the customer's own accounts, with all bank rules checked in the database
- Sets monthly budgets with alert levels and shows progress bars that turn amber and red

## Live demo

- Vercel link: <your Vercel link>
- Passcode: <your passcode>
- Try this prompt: "Move 20,000 from savings to my salary account."

## Agent tools

| Tool            | What it does                                                                               | Reads or writes |
| --------------- | ------------------------------------------------------------------------------------------ | --------------- |
| getMyAccounts   | Shows the customer's accounts, balances, frozen status and transfer limits                 | Reads           |
| getTransactions | Lists transactions with filters for account, category, direction and dates                 | Reads           |
| getSpendSummary | Totals spending by category for this month or last month                                   | Reads           |
| getBudgetStatus | Shows each budget with spent, left and percent used                                        | Reads           |
| transferFunds   | Moves money between the customer's own accounts using the database function transfer_funds | Writes          |
| setBudgetAlert  | Creates or updates a monthly budget and alert level for a category                         | Writes          |

## How the agent works

1. The user's message and our list of tools go to Gemini, which picks a tool and its arguments.
2. Our code checks the arguments with Zod, then runs the tool against Supabase. Gemini never touches the database.
3. The result goes back to Gemini, and this repeats until it can give a final answer (at most 8 rounds).

Business rules (transfers only between own accounts, no frozen accounts, no overdraft, per-transfer and daily limits by KYC level) are checked inside the database function, so the AI cannot break them. The agent never asks for or shows a PIN, OTP or full account number.

## Database tables

- customers: the bank customers and their KYC level
- accounts: each customer's accounts with balance and frozen flag
- transfer_limits: per-transfer and daily limits for each KYC level
- transactions: debits and credits with a spending category
- budgets: monthly budget and alert level per customer and category

## Tech stack

Next.js, React, TypeScript, Tailwind CSS, Supabase, Gemini API (function calling), Zod, Vercel

## Run it locally

1. npm install
2. Copy .env.example to .env.local and fill in the keys
3. npm run dev
