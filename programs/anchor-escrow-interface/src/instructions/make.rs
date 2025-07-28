use anchor_lang::prelude::*;
use crate::state::Escrow;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked},
};

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Make<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    // mint of the token the maker will deposit in the escrow
    // the token program is the token program of the mint_a (ata of the vault will be initialized with the same token program)
    #[account(
        mint::token_program = token_program,
    )]
    pub mint_a: InterfaceAccount<'info, Mint>,      

    // mint of the token the maker wants to receive
    // the token program can be the same as mint_a or a different token program (token program is not needed as this supports both)
    pub mint_b: InterfaceAccount<'info, Mint>,      

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_ata_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = maker,
        associated_token::mint = mint_a,
        associated_token::authority = escrow,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init, 
        payer = maker, 
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,

    // just one token program is needed (the same as mint_a to initialize the vault)
    //but both token programs (SPL token or SPL Token 2022) are supported -> hence using Interface
    pub token_program: Interface<'info, TokenInterface>,

    // associated token program is used to initialize the vault (ATA)
    pub associated_token_program: Program<'info, AssociatedToken>,
}
impl<'info> Make<'info> {
    pub fn init_escrow(&mut self, seed: u64, amount_receive: u64, bumps: &MakeBumps) -> Result<()> {
        
        self.escrow.set_inner(Escrow { 
            seed, 
            maker: self.maker.key(), 
            mint_a: self.mint_a.key(), 
            mint_b: self.mint_b.key(), 
            amount_receive, 
            bump: bumps.escrow
        });
        
        Ok(())
    }

    pub fn make(&mut self, amount_transfer: u64) -> Result<()> {
        
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = TransferChecked {
            from: self.maker_ata_a.to_account_info(),
            mint: self.mint_a.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.maker.to_account_info(),
        };
        let cpi_ctx: CpiContext<TransferChecked> = CpiContext::new(cpi_program, cpi_accounts);
        transfer_checked(cpi_ctx, amount_transfer, self.mint_a.decimals)?;

        Ok(())
    }
}

