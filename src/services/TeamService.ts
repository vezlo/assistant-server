import { SupabaseClient } from '@supabase/supabase-js';
import { PasswordUtils } from '../middleware/auth';
import logger from '../config/logger';

export interface TeamMember {
  uuid: string;
  user_uuid: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTeamMemberInput {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'user';
}

export interface UpdateTeamMemberInput {
  name?: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'inactive';
  password?: string;
}

export class TeamService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Create a new team member (user + profile)
   */
  async createTeamMember(
    companyId: number,
    input: CreateTeamMemberInput
  ): Promise<TeamMember> {
    try {
      // Check if user already exists
      const { data: existingUser } = await this.supabase
        .from('vezlo_users')
        .select('id, uuid, email')
        .eq('email', input.email)
        .single();

      let userId: number;
      let userUuid: string;

      if (existingUser) {
        // User exists - check if already in this company
        const { data: existingProfile } = await this.supabase
          .from('vezlo_user_company_profiles')
          .select('id')
          .eq('user_id', existingUser.id)
          .eq('company_id', companyId)
          .single();

        if (existingProfile) {
          throw new Error('User is already a member of this company');
        }

        userId = existingUser.id;
        userUuid = existingUser.uuid;
      } else {
        // Create new user
        const passwordHash = await PasswordUtils.hash(input.password);
        const { data: newUser, error: userError } = await this.supabase
          .from('vezlo_users')
          .insert({
            email: input.email,
            name: input.name,
            password_hash: passwordHash
          })
          .select('id, uuid')
          .single();

        if (userError) {
          throw new Error(`Failed to create user: ${userError.message}`);
        }

        userId = newUser.id;
        userUuid = newUser.uuid;
      }

      // Create profile
      const { data: profile, error: profileError } = await this.supabase
        .from('vezlo_user_company_profiles')
        .insert({
          user_id: userId,
          company_id: companyId,
          role: input.role,
          status: 'active'
        })
        .select(`
          uuid,
          role,
          status,
          created_at,
          updated_at,
          vezlo_users:user_id (
            uuid,
            email,
            name
          )
        `)
        .single();

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      return {
        uuid: profile.uuid,
        user_uuid: userUuid,
        email: (profile.vezlo_users as any).email,
        name: (profile.vezlo_users as any).name,
        role: profile.role,
        status: profile.status,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      };
    } catch (error) {
      logger.error('Error creating team member:', error);
      throw error;
    }
  }

  /**
   * Get team members for a company with pagination and search
   */
  async getTeamMembers(
    companyId: number,
    options?: { search?: string; page?: number; limit?: number }
  ): Promise<{ members: TeamMember[]; total: number; page: number; limit: number }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 50;
      const search = options?.search?.trim().toLowerCase();
      const offset = (page - 1) * limit;

      // First get all matching profiles (with user data)
      let query = this.supabase
        .from('vezlo_user_company_profiles')
        .select(`
          uuid,
          role,
          status,
          created_at,
          updated_at,
          vezlo_users:user_id (
            uuid,
            email,
            name
          )
        `, { count: 'exact' })
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      const { data: allData, error, count } = await query;

      if (error) {
        throw new Error(`Failed to get team members: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Filter by search term if provided
      let filtered = allData || [];
      if (search) {
        filtered = filtered.filter((profile: any) => {
          const userName = (profile.vezlo_users as any)?.name?.toLowerCase() || '';
          return userName.includes(search);
        });
      }

      // Apply pagination
      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit);

      const members = paginated.map((profile: any) => ({
        uuid: profile.uuid,
        user_uuid: profile.vezlo_users.uuid,
        email: profile.vezlo_users.email,
        name: profile.vezlo_users.name,
        role: profile.role,
        status: profile.status,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      }));

      return {
        members,
        total: search ? total : (count || 0),
        page,
        limit
      };
    } catch (error) {
      logger.error('Error getting team members:', error);
      throw error;
    }
  }

  /**
   * Update team member
   */
  async updateTeamMember(
    companyId: number,
    profileUuid: string,
    input: UpdateTeamMemberInput,
    currentUserProfileUuid: string
  ): Promise<TeamMember> {
    try {
      // Get profile to verify it belongs to company
      const { data: profile, error: profileError } = await this.supabase
        .from('vezlo_user_company_profiles')
        .select('id, user_id, role, status, uuid')
        .eq('uuid', profileUuid)
        .eq('company_id', companyId)
        .single();

      if (profileError || !profile) {
        throw new Error('Team member not found');
      }

      // Prevent admin from changing another admin's password
      if (input.password !== undefined && profile.role === 'admin' && profile.uuid !== currentUserProfileUuid) {
        throw new Error('You cannot change another admin\'s password');
      }

      // Prevent user from changing their own role or status
      if (profile.uuid === currentUserProfileUuid) {
        if (input.role !== undefined && input.role !== profile.role) {
          throw new Error('You cannot change your own role');
        }
        if (input.status !== undefined && input.status !== profile.status) {
          throw new Error('You cannot change your own status');
        }
      }

      // Update profile if role or status changed
      const profileUpdates: any = {};
      if (input.role !== undefined) profileUpdates.role = input.role;
      if (input.status !== undefined) profileUpdates.status = input.status;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: updateError } = await this.supabase
          .from('vezlo_user_company_profiles')
          .update(profileUpdates)
          .eq('id', profile.id);

        if (updateError) {
          throw new Error(`Failed to update profile: ${updateError.message}`);
        }
      }

      // Update user if name or password changed
      const userUpdates: any = {};
      if (input.name !== undefined) userUpdates.name = input.name;
      if (input.password !== undefined) {
        userUpdates.password_hash = await PasswordUtils.hash(input.password);
      }

      if (Object.keys(userUpdates).length > 0) {
        const { error: userUpdateError } = await this.supabase
          .from('vezlo_users')
          .update(userUpdates)
          .eq('id', profile.user_id);

        if (userUpdateError) {
          throw new Error(`Failed to update user: ${userUpdateError.message}`);
        }
      }

      // Fetch updated data
      const { data: updatedProfile, error: fetchError } = await this.supabase
        .from('vezlo_user_company_profiles')
        .select(`
          uuid,
          role,
          status,
          created_at,
          updated_at,
          vezlo_users:user_id (
            uuid,
            email,
            name
          )
        `)
        .eq('id', profile.id)
        .single();

      if (fetchError || !updatedProfile) {
        throw new Error('Failed to fetch updated profile');
      }

      return {
        uuid: updatedProfile.uuid,
        user_uuid: (updatedProfile.vezlo_users as any).uuid,
        email: (updatedProfile.vezlo_users as any).email,
        name: (updatedProfile.vezlo_users as any).name,
        role: updatedProfile.role,
        status: updatedProfile.status,
        created_at: updatedProfile.created_at,
        updated_at: updatedProfile.updated_at
      };
    } catch (error) {
      logger.error('Error updating team member:', error);
      throw error;
    }
  }

  /**
   * Delete team member (remove from company)
   */
  async deleteTeamMember(companyId: number, profileUuid: string, currentUserProfileUuid: string): Promise<void> {
    try {
      // Get profile to verify it belongs to company
      const { data: profile } = await this.supabase
        .from('vezlo_user_company_profiles')
        .select('id, user_id, role, uuid')
        .eq('uuid', profileUuid)
        .eq('company_id', companyId)
        .single();

      if (!profile) {
        throw new Error('Team member not found');
      }

      // Prevent admin from deleting themselves
      if (profile.uuid === currentUserProfileUuid) {
        throw new Error('You cannot delete your own account');
      }

      // Check if this is the last admin (exclude the profile being deleted)
      if (profile.role === 'admin') {
        const { data: otherAdmins, error: countError } = await this.supabase
          .from('vezlo_user_company_profiles')
          .select('id')
          .eq('company_id', companyId)
          .eq('role', 'admin')
          .eq('status', 'active')
          .neq('id', profile.id);

        if (countError) {
          logger.error('Error checking admin count:', countError);
          throw new Error('Failed to verify admin count');
        }

        // If no other active admins exist, this is the last admin
        if (!otherAdmins || otherAdmins.length === 0) {
          throw new Error('Cannot remove the last admin from the company');
        }
      }

      // Delete profile (user remains, just removed from company)
      const { error } = await this.supabase
        .from('vezlo_user_company_profiles')
        .delete()
        .eq('id', profile.id);

      if (error) {
        throw new Error(`Failed to delete team member: ${error.message}`);
      }
    } catch (error) {
      logger.error('Error deleting team member:', error);
      throw error;
    }
  }
}
