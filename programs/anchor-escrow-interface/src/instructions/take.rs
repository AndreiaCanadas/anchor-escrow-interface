use anchor_lang::prelude::*;
use crate::{state::Escrow, errors::EscrowError};
use anchor_spl::{
    associated_token::AssociatedToken, token_interface::{close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked}
};

#[derive(Accounts)]
pub struct Take<'info> {
    #[account(mut)]
    pub maker: SystemAccount<'info>,

    #[account(mut)]
    pub taker: Signer<'info>,

    // mint of the token the maker will deposit in the escrow
    // the token program is the token program of the mint_a
    #[account(
        mint::token_program = token_program,
    )]
    pub mint_a: InterfaceAccount<'info, Mint>,      

    // mint of the token the maker wants to receive
    // the token program can be the same as mint_a or a different token program (in this case token program option)
    pub mint_b: InterfaceAccount<'info, Mint>,      

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = escrow,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    // two option accounts for the maker ata for mint_b are used, to allow initialization if needed in constraints
    // as token program needs to be declared when using InterfaceAccount

    // Option 1: maker ata for mint_b if token program is the same as mint_a
    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_b,
        associated_token::authority = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_ata_b: Option<InterfaceAccount<'info, TokenAccount>>,
    // Option 2: maker ata for mint_b if token program is different from mint_a
    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_b,
        associated_token::authority = maker,
        associated_token::token_program = token_program_option,
    )]
    pub maker_ata_b_option: Option<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = taker,
        associated_token::token_program = token_program,
    )]
    pub taker_ata_b: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_a,
        associated_token::authority = taker,
        associated_token::token_program = token_program,
    )]
    pub taker_ata_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        close = maker,
        has_one = maker,
        has_one = mint_a,
        has_one = mint_b,
        seeds = [b"escrow", maker.key().as_ref(), escrow.seed.to_le_bytes().as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,

    pub token_program: Interface<'info, TokenInterface>,
    pub token_program_option: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}
impl<'info> Take<'info> {

      // Transfers the amount the maker wants to receive (mint_b) from the taker to the maker.
      pub fn transfer_to_maker(&mut self) -> Result<()> {
        
        // in case mint_b token program is the same as mint_a token program
        // use maker_ata_b and token_program
        if self.mint_b.to_account_info().owner == &self.token_program.key() {
            assert!(self.maker_ata_b.is_some());
            let cpi_program = self.token_program.to_account_info();
            let cpi_accounts = TransferChecked {
                from: self.taker_ata_b.to_account_info(),
                mint: self.mint_b.to_account_info(),
                to: self.maker_ata_b.as_ref().unwrap().to_account_info(),
                authority: self.taker.to_account_info(),
            };
            let cpi_ctx: CpiContext<TransferChecked> = CpiContext::new(cpi_program, cpi_accounts);
            transfer_checked(cpi_ctx, self.escrow.amount_receive, self.mint_b.decimals)?;
        }
        // in case mint_b token program is different from mint_a token program
        // use maker_ata_b_option and token_program_option
        else if self.mint_b.to_account_info().owner == &self.token_program_option.key() {
            assert!(self.maker_ata_b_option.is_some());
            let cpi_program = self.token_program_option.to_account_info();
            let cpi_accounts = TransferChecked {
                from: self.taker_ata_b.to_account_info(),
                mint: self.mint_b.to_account_info(),
                to: self.maker_ata_b_option.as_ref().unwrap().to_account_info(),
                authority: self.taker.to_account_info(),
            };
            let cpi_ctx: CpiContext<TransferChecked> = CpiContext::new(cpi_program, cpi_accounts);
            transfer_checked(cpi_ctx, self.escrow.amount_receive, self.mint_b.decimals)?;
        }
        else {
            return Err(EscrowError::InvalidTokenProgram.into());
        }
        
        Ok(())
    }

    // Transfers the locked amount (mint_a) from the vault to the taker.
    pub fn transfer_to_taker(&mut self) -> Result<()> {
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = TransferChecked {
            from: self.vault.to_account_info(),
            mint: self.mint_a.to_account_info(),
            to: self.taker_ata_a.to_account_info(),
            authority: self.escrow.to_account_info(),
        };
        let signer_seeds: [&[&[u8]]; 1] = [&[
            b"escrow",
            self.maker.to_account_info().key.as_ref(),
            &self.escrow.seed.to_le_bytes()[..],
            &[self.escrow.bump],
        ]];
        let amount = self.vault.amount;

        let cpi_ctx: CpiContext<TransferChecked> = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer_seeds);
        transfer_checked(cpi_ctx, amount, self.mint_a.decimals)?;

        Ok(())
    }

    // Closes the vault and transfers the lamports to the maker.
    pub fn close_vault(&mut self) -> Result<()> {
        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = CloseAccount {
            account: self.vault.to_account_info(),
            destination: self.maker.to_account_info(),
            authority: self.escrow.to_account_info(),
        };
        let signer_seeds: [&[&[u8]]; 1] = [&[
            b"escrow",
            self.maker.to_account_info().key.as_ref(),
            &self.escrow.seed.to_le_bytes()[..],
            &[self.escrow.bump],
        ]];
        let cpi_ctx: CpiContext<CloseAccount> = CpiContext::new_with_signer(cpi_program, cpi_accounts, &signer_seeds);
        close_account(cpi_ctx)?;
        
        Ok(())
    }
}

