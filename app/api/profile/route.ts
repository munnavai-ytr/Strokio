import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { updateProfileSchema } from '@/lib/validators';

export async function GET() {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: 'Supabase credentials are not configured.' },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      // Create profile row if trigger hasn't fired yet
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Artist',
          avatar_url: user.user_metadata?.avatar_url || null,
          theme: 'system',
          default_difficulty: 'easy',
          voice_language: 'bn',
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      profile = newProfile;
    }

    return NextResponse.json({
      profile,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch profile';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: 'Supabase credentials are not configured.' },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const json = await request.json();
    const parsed = updateProfileSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(parsed.data)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: updatedProfile });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update profile';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE() {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: 'Supabase credentials are not configured.' },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Delete all user lessons from DB (cascades to steps and feedback)
    await supabase.from('lessons').delete().eq('user_id', user.id);

    // 2. Delete user folder in storage
    const storageClient = createAdminClient() || supabase;
    const { data: files } = await storageClient.storage.from('originals').list(user.id);
    if (files && files.length > 0) {
      const filePaths = files.map((f) => `${user.id}/${f.name}`);
      await storageClient.storage.from('originals').remove(filePaths);
    }

    return NextResponse.json({
      success: true,
      message: 'All user drawing lessons and data have been cleared.',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete user data';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
