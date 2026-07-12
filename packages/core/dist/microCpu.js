/** A small, educational, 6502-flavoured microcoded accumulator CPU. */
export class MicroCpu {
    memory = new Uint8Array(256);
    registers = {
        a: 0, pc: 0, ir: 0, mar: 0, tmp: 0,
        zero: false, negative: false, carry: false,
    };
    halted = false;
    cycles = 0;
    queue = [];
    currentInstruction = "RESET";
    lastStep = {
        label: "Ready",
        commands: [],
    };
    constructor(program = [], startAddress = 0) {
        this.load(program, startAddress);
        this.reset(startAddress);
    }
    load(program, startAddress = 0) {
        if (startAddress < 0 || startAddress + program.length > this.memory.length) {
            throw new RangeError("Program does not fit in 256-byte memory");
        }
        this.memory.set(program.map(byte), startAddress);
    }
    reset(startAddress = 0) {
        Object.assign(this.registers, {
            a: 0, pc: byte(startAddress), ir: 0, mar: 0, tmp: 0,
            zero: false, negative: false, carry: false,
        });
        this.halted = false;
        this.cycles = 0;
        this.queue = [];
        this.currentInstruction = "FETCH";
        this.lastStep = { label: "Reset", commands: ["PC_LOAD"] };
        this.enqueueFetch();
    }
    tick() {
        if (this.halted)
            return this.snapshot();
        if (this.queue.length === 0)
            this.enqueueFetch();
        const step = this.queue.shift();
        step.run();
        this.lastStep = step;
        this.cycles++;
        return this.snapshot();
    }
    /** Execute the fetch sequence and one complete programmer-visible instruction. */
    stepInstruction() {
        let sawDecodedInstruction = this.currentInstruction !== "FETCH";
        for (let guard = 0; guard < 64 && !this.halted; guard++) {
            const result = this.tick();
            if (this.currentInstruction !== "FETCH")
                sawDecodedInstruction = true;
            if (sawDecodedInstruction && this.queue.length === 0)
                return result;
        }
        return this.snapshot();
    }
    snapshot() {
        return {
            registers: { ...this.registers },
            memory: Array.from(this.memory),
            halted: this.halted,
            cycles: this.cycles,
            instruction: this.currentInstruction,
            microinstruction: this.lastStep.label,
            microcommands: [...this.lastStep.commands],
        };
    }
    enqueueFetch() {
        this.currentInstruction = "FETCH";
        this.queue.push(this.step("Place PC on address bus", ["PC_OUT", "MAR_LOAD"], () => {
            this.registers.mar = this.registers.pc;
        }), this.step("Read opcode and advance PC", ["MEM_READ", "IR_LOAD", "PC_INCREMENT"], () => {
            this.registers.ir = this.memory[this.registers.mar];
            this.registers.pc = byte(this.registers.pc + 1);
        }), this.step("Decode opcode", ["IR_DECODE", "MICRO_JUMP"], () => this.decode()));
    }
    decode() {
        const opcode = this.registers.ir;
        switch (opcode) {
            case 0x00:
                this.currentInstruction = "BRK";
                this.queue.push(this.step("Stop processor", ["HALT"], () => { this.halted = true; }));
                break;
            case 0xea:
                this.currentInstruction = "NOP";
                this.finish();
                break;
            case 0xa9:
                this.immediate("LDA #imm", (value) => { this.registers.a = value; this.setNZ(value); });
                break;
            case 0xa5:
                this.zeroPageRead("LDA zp", (value) => { this.registers.a = value; this.setNZ(value); });
                break;
            case 0x85:
                this.zeroPageAddress("STA zp", () => this.queue.push(this.step("Store accumulator", ["A_OUT", "MEM_WRITE"], () => { this.memory[this.registers.mar] = this.registers.a; })));
                break;
            case 0x69:
                this.immediate("ADC #imm", (value) => {
                    const result = this.registers.a + value + (this.registers.carry ? 1 : 0);
                    this.registers.carry = result > 0xff;
                    this.registers.a = byte(result);
                    this.setNZ(this.registers.a);
                }, ["ALU_ADD", "A_LOAD", "FLAGS_LOAD"]);
                break;
            case 0x4c:
                this.absoluteJump();
                break;
            case 0xd0:
                this.relativeBranch();
                break;
            default:
                this.currentInstruction = `UNKNOWN $${hex(opcode)}`;
                this.queue.push(this.step("Unknown opcode", ["HALT", "ERROR"], () => { this.halted = true; }));
        }
    }
    immediate(name, apply, commands = ["MEM_READ", "A_LOAD", "FLAGS_LOAD"]) {
        this.currentInstruction = name;
        this.queue.push(this.step("Address immediate operand", ["PC_OUT", "MAR_LOAD"], () => { this.registers.mar = this.registers.pc; }), this.step("Read immediate operand", [...commands, "PC_INCREMENT"], () => {
            this.registers.tmp = this.memory[this.registers.mar];
            apply(this.registers.tmp);
            this.registers.pc = byte(this.registers.pc + 1);
        }));
    }
    zeroPageAddress(name, afterAddress) {
        this.currentInstruction = name;
        this.queue.push(this.step("Address zero-page operand", ["PC_OUT", "MAR_LOAD"], () => { this.registers.mar = this.registers.pc; }), this.step("Fetch zero-page address", ["MEM_READ", "MAR_LOAD", "PC_INCREMENT"], () => {
            this.registers.mar = this.memory[this.registers.mar];
            this.registers.pc = byte(this.registers.pc + 1);
            afterAddress();
        }));
    }
    zeroPageRead(name, apply) {
        this.zeroPageAddress(name, () => this.queue.push(this.step("Read zero-page value", ["MEM_READ", "A_LOAD", "FLAGS_LOAD"], () => apply(this.memory[this.registers.mar]))));
    }
    absoluteJump() {
        this.currentInstruction = "JMP abs";
        this.queue.push(this.step("Fetch target low byte", ["PC_OUT", "MEM_READ", "TMP_LOAD", "PC_INCREMENT"], () => {
            this.registers.tmp = this.memory[this.registers.pc];
            this.registers.pc = byte(this.registers.pc + 1);
        }), this.step("Fetch target high byte and jump", ["MEM_READ", "PC_LOAD"], () => {
            const high = this.memory[this.registers.pc];
            if (high !== 0)
                throw new RangeError("This milestone CPU only addresses page zero");
            this.registers.pc = this.registers.tmp;
        }));
    }
    relativeBranch() {
        this.currentInstruction = "BNE rel";
        this.queue.push(this.step("Read signed branch offset", ["MEM_READ", "TMP_LOAD", "PC_INCREMENT"], () => {
            this.registers.tmp = this.memory[this.registers.pc];
            this.registers.pc = byte(this.registers.pc + 1);
            if (!this.registers.zero)
                this.queue.push(this.step("Apply branch offset", ["ALU_ADD", "PC_LOAD"], () => {
                    const offset = this.registers.tmp < 0x80 ? this.registers.tmp : this.registers.tmp - 0x100;
                    this.registers.pc = byte(this.registers.pc + offset);
                }));
        }));
    }
    finish() {
        this.queue.push(this.step("Return to fetch", ["GOTO_FETCH"], () => { }));
    }
    setNZ(value) {
        this.registers.zero = byte(value) === 0;
        this.registers.negative = (value & 0x80) !== 0;
    }
    step(label, commands, run) {
        return { label, commands, run };
    }
}
function byte(value) { return value & 0xff; }
function hex(value) { return byte(value).toString(16).toUpperCase().padStart(2, "0"); }
export const DEMO_PROGRAM = [
    0xa9, 0x05, // LDA #$05
    0x85, 0x10, // STA $10
    0xa9, 0x03, // LDA #$03
    0x69, 0x05, // ADC #$05
    0x85, 0x11, // STA $11
    0x00, // BRK
];
