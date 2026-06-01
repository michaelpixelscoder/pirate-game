export type BlockCell = {
  x: number;
  y: number;
  z: number;
};

export type BlockDefinition = {
  id: string;
  name: string;
  icon: string;
  color: number;
  mass: number;
  cells: BlockCell[];
  description?: string;
};

export type ToolDefinition = {
  id: string;
  name: string;
  icon: string;
  type: "block-placement";
  description?: string;
  blockId: string;
};

export type RegisterBlockOptions =
  | boolean
  | {
      tool?: boolean;
      toolId?: string;
      toolName?: string;
      toolIcon?: string;
      toolDescription?: string;
    };

export class BuildRegistry {
  private readonly blocks = new Map<string, BlockDefinition>();
  private readonly blockOrder: string[] = [];
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly toolOrder: string[] = [];

  registerBlock(block: BlockDefinition, options: RegisterBlockOptions = false) {
    if (this.blocks.has(block.id)) {
      throw new Error(`Block already registered: ${block.id}`);
    }
    this.blocks.set(block.id, block);
    this.blockOrder.push(block.id);

    const toolEnabled = options === true || (typeof options === "object" && options.tool === true);
    if (toolEnabled) {
      this.registerTool({
        id: typeof options === "object" && options.toolId ? options.toolId : `place:${block.id}`,
        name: typeof options === "object" && options.toolName ? options.toolName : block.name,
        icon: typeof options === "object" && options.toolIcon ? options.toolIcon : block.icon,
        type: "block-placement",
        description: typeof options === "object" ? options.toolDescription : undefined,
        blockId: block.id
      });
    }

    return block;
  }

  registerTool(tool: ToolDefinition) {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }
    this.tools.set(tool.id, tool);
    this.toolOrder.push(tool.id);
    return tool;
  }

  listBlocks() {
    return this.blockOrder.map((id) => this.blocks.get(id)!).filter(Boolean);
  }

  listTools() {
    return this.toolOrder.map((id) => this.tools.get(id)!).filter(Boolean);
  }

  getBlock(id: string) {
    return this.blocks.get(id) ?? null;
  }

  getTool(id: string) {
    return this.tools.get(id) ?? null;
  }
}

export function rotateBlockCells(cells: BlockCell[], turns: number) {
  const normalizedTurns = ((turns % 4) + 4) % 4;
  return cells.map((cell) => {
    let x = cell.x;
    let z = cell.z;
    for (let i = 0; i < normalizedTurns; i++) {
      const nextX = -z;
      z = x;
      x = nextX;
    }
    return { x, y: cell.y, z };
  });
}
