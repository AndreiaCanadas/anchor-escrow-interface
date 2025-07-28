use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub seed: u64,               // seed to allow each maker to have multiple escrows
    pub maker: Pubkey,           // maker of the escrow
    pub mint_a: Pubkey,          // mint of the token being received
    pub mint_b: Pubkey,          // mint of the token being sent
    pub amount_receive: u64,     // amount that the maker wants to receive
    pub bump: u8,                // bump of the escrow
}