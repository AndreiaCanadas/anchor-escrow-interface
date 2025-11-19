# Anchor Escrow Interface

This program implements an Escrow contract that supports both SPL Token and SPL Token 2022 through the TokenInterface. A maker initiates an escrow by depositing tokens (`amount_transfer` of `mint_a`) into a vault in exchange for tokens (`amount_receive` of `mint_b`). Any taker can complete the exchange by providing the requested tokens, receiving the vaulted tokens atomically.

---

## Architecture

The Escrow state account consists of:

```rust
#[account]
pub struct Escrow {
    pub seed: u64,               // seed to allow each maker to have multiple escrows
    pub maker: Pubkey,           // maker of the escrow
    pub mint_a: Pubkey,          // mint of the token being deposited
    pub mint_b: Pubkey,          // mint of the token being received
    pub amount_receive: u64,     // amount that the maker wants to receive
    pub bump: u8,                // bump of the escrow PDA
}
```

The Escrow account stores:

- `seed`: Unique identifier allowing each maker to create multiple escrows
- `maker`: The user initiating the escrow
- `mint_a`: The token being deposited into the vault
- `mint_b`: The token the maker wants to receive
- `amount_receive`: The amount of mint_b the maker wants to receive
- `bump`: The PDA bump seed

The Escrow account is derived as a PDA from "escrow", the maker's public key, and the seed value.

---

### Make Instruction

The maker creates an escrow with the following context:

```rust
#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Make<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(
        mint::token_program = token_program,
    )]
    pub mint_a: InterfaceAccount<'info, Mint>,      

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

    pub token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}
```

Accounts:

- `maker`: Signer creating the escrow (mutable)
- `mint_a`: Mint of the token being deposited (supports SPL Token and Token 2022)
- `mint_b`: Mint of the token the maker wants to receive (supports SPL Token and Token 2022)
- `maker_ata_a`: Maker's ATA for mint_a (mutable, tokens transferred from here)
- `vault`: ATA owned by the escrow PDA to hold mint_a until exchange completes
- `escrow`: Escrow state account (PDA derived from "escrow", maker key, and seed)
- `token_program`: Token program interface supporting both SPL Token and Token 2022
- `associated_token_program`: Associated token program
- `system_program`: System program

### Implementation

```rust
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
```

`init_escrow` initializes the escrow account with the exchange conditions. `make` transfers tokens from the maker's ATA to the vault using `transfer_checked`. The `token_program` needs to be the program of the `mint_a` token.

---

### Take Instruction

The taker completes the escrow exchange with the following context:

```rust
#[derive(Accounts)]
pub struct Take<'info> {
    #[account(mut)]
    pub maker: SystemAccount<'info>,

    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(
        mint::token_program = token_program,
    )]
    pub mint_a: InterfaceAccount<'info, Mint>,      

    pub mint_b: InterfaceAccount<'info, Mint>,      

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = escrow,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_b,
        associated_token::authority = maker,
        associated_token::token_program = token_program,
    )]
    pub maker_ata_b: Option<InterfaceAccount<'info, TokenAccount>>,

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
```

Accounts:

- `maker`: Account of the escrow creator
- `taker`: Signer accepting the exchange (mutable)
- `mint_a`: Mint of the token being received by taker
- `mint_b`: Mint of the token being sent by taker
- `vault`: Vault holding mint_a until exchange completes (mutable)
- `maker_ata_b`: Maker's ATA for mint_b (same token program as mint_a, init_if_needed)
- `maker_ata_b_option`: Maker's ATA for mint_b (different token program, init_if_needed)
- `taker_ata_b`: Taker's ATA for mint_b (mutable, tokens transferred from here)
- `taker_ata_a`: Taker's ATA for mint_a (init_if_needed)
- `escrow`: Escrow state account (closed after exchange, rent returned to maker)
- `token_program`: Token program interface for mint_a
- `token_program_option`: Token program interface for mint_b if different from mint_a
- `associated_token_program`: Associated token program
- `system_program`: System program

### Implementation

```rust
impl<'info> Take<'info> {

    pub fn transfer_to_maker(&mut self) -> Result<()> {
        
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
```

`transfer_to_maker` transfers mint_b from taker to maker. It detects which token program mint_b uses (same as mint_a or different) and uses the corresponding ATA and token program.

`transfer_to_taker` transfers all mint_a from the vault to the taker. Since the vault authority is the escrow PDA, signer seeds are required for the CPI.

`close_vault` closes the vault account and returns rent to the maker, using signer seeds for the PDA authority.

---

### Program Instructions

```rust
#[program]
pub mod anchor_escrow_interface {
    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, amount_receive: u64, amount_transfer: u64) -> Result<()> {
        ctx.accounts.init_escrow(seed, amount_receive, &ctx.bumps)?;
        ctx.accounts.make(amount_transfer)?;
        Ok(())
    }

    pub fn take(ctx: Context<Take>) -> Result<()> {
        ctx.accounts.transfer_to_maker()?;
        ctx.accounts.transfer_to_taker()?;
        ctx.accounts.close_vault()?;
        Ok(())
    }
}
```

The `make` instruction initializes the escrow account and transfers tokens from the maker to the vault.

The `take` instruction transfers mint_b from taker to maker, transfers mint_a from vault to taker, and closes the vault account.
