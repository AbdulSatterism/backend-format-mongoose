/* eslint-disable @typescript-eslint/no-explicit-any */
type PrismaWhereInput = Record<string, any>;
type PrismaOrderBy = Record<string, 'asc' | 'desc'>;

export interface PrismaQueryParams {
  where: PrismaWhereInput;
  orderBy: PrismaOrderBy | PrismaOrderBy[];
  skip: number;
  take: number;
  select?: Record<string, boolean>;
}

class QueryBuilder {
  public where: PrismaWhereInput;
  public orderBy: PrismaOrderBy | PrismaOrderBy[];
  public skip: number;
  public take: number;
  public select: Record<string, boolean> | undefined;
  public query: Record<string, unknown>;

  constructor(query: Record<string, unknown>) {
    this.query = query;
    this.where = {};
    this.orderBy = { createdAt: 'desc' };
    this.skip = 0;
    this.take = 10;
    this.select = undefined;
  }

  search(searchableFields: string[]) {
    const searchTerm = this?.query?.searchTerm;
    if (searchTerm) {
      this.where.OR = searchableFields.map(field => ({
        [field]: {
          contains: searchTerm as string,
          mode: 'insensitive',
        },
      }));
    }

    return this;
  }

  filter() {
    const queryObj = { ...this.query };

    // filtering
    const excludeFields = ['searchTerm', 'sort', 'limit', 'page', 'fields'];

    excludeFields.forEach(el => delete queryObj[el]);

    // Add to where clause
    Object.assign(this.where, queryObj);
    return this;
  }

  sort() {
    const sort = this?.query?.sort as string;
    if (sort) {
      const sortFields = sort.split(',');
      this.orderBy = sortFields.map(field => {
        if (field.startsWith('-')) {
          return { [field.substring(1)]: 'desc' as const };
        }
        return { [field]: 'asc' as const };
      });
    }

    return this;
  }

  paginate() {
    const page = Number(this?.query?.page) || 1;
    const limit = Number(this?.query.limit) || 10;
    this.skip = (page - 1) * limit;
    this.take = limit;

    return this;
  }

  fields() {
    const fields = this?.query?.fields as string;
    if (fields) {
      const fieldArray = fields.split(',');
      this.select = {};
      fieldArray.forEach(field => {
        if (this.select) {
          this.select[field.trim()] = true;
        }
      });
    }

    return this;
  }

  build(): PrismaQueryParams {
    return {
      where: this.where,
      orderBy: this.orderBy,
      skip: this.skip,
      take: this.take,
      select: this.select,
    };
  }
}

export default QueryBuilder;
